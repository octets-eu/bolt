import type { Actuators } from '../actuators/actuators';
import type { Context } from '../context';
import type { Sensors } from '../sensors/sensors';
import { angleDistance, mod360 } from '../helpers/math';
import { StabilizationIndex } from '../protocol/constants';
import { wait } from '../helpers/utils';

export interface LockOnResult {
  reason: 'collision' | 'all round' | 'aborted';
  /** Milliseconds spent in each state. */
  time: { search: number, track: number, locked: number };
  notifies: number;
  turns: number;
  tracks: number;
  /** Edges of the zone heard in the last track, degrees relative to where it started, left then right. */
  edges: number[];
  /** Front or back by the 0x22 reading after the last track; unknown when none came within 10 s. */
  side: 'front' | 'back' | 'unknown';
  heading: number;
}

/**
 * Turn to face a Bolt that sends `channel` weakly, by the listen notify.
 * Motor commands only, its own loop. Measured basis in
 * research/infrared-external-device.md (2026-10-01):
 *
 * - A Bolt emits at most one frame per 200 ms; 0x2a at strength 2 arrives
 *   at 50 cm 46 to 48 of 48, the notify fires for nearly every frame.
 * - At 50 cm a receiver hears a strength 2 frame within about +-60 to +-70
 *   degrees of its front and of its back and is deaf at both sides; the
 *   edges are sharp to 10 to 20 degrees, the zone width differs per Bolt.
 * - The notify carries no side; 0x22 does (front left, front right, back
 *   right, back left), but a poll catches it in 1 to 4 % of polls.
 *
 * search: blinking O until a notify on `channel`. track: static O; find
 * both edges of the zone it hears in (20 degree steps, then halved to 5),
 * aim at their middle; the first 0x22 reading on one pair tells front from
 * back, back turns 180. locked: U, its open end toward the sender. No
 * notify for 1 s goes back to search. Ends on a collision, a fullstop, or
 * a zone without an edge (heard all round).
 */
export async function lockOn (ctx: Context, actuators: Actuators, sensors: Sensors, channel: number): Promise<LockOnResult> {
  const s = ctx.motion;
  const { status } = ctx;
  const { matrix, motor } = actuators;
  const color = ctx.config.colors.matrix;
  const t0 = ctx.now();
  const time = { search: 0, track: 0, locked: 0 };
  let state = 'search' as keyof typeof time, since = t0;
  const enter = (next: keyof typeof time) => { time[state] += ctx.now() - since; since = ctx.now(); return next; };
  let reason = null as LockOnResult['reason'] | null;
  let notifies = 0, heard = -Infinity, turns = 0, tracks = 0;
  let side: LockOnResult['side'] = 'unknown', edges: number[] = [];
  const done = () => reason !== null || s.aborted;

  // listen is one-shot: re-arm after every notify
  const offInfrared = await sensors.infrared.subscribe(({ payload }) => {
    if (payload[0] === channel) { notifies++; heard = ctx.now(); }
    void sensors.listenInfrared(true);
  });
  const offCollision = await sensors.collision.subscribe(() => { reason = 'collision'; }, {});
  const release = await sensors.motion.subscribe(null);
  await motor.stabilize(StabilizationIndex.full);
  await sensors.listenInfrared(true);

  const turnTo = async (h: number) => {
    if (Math.abs(angleDistance(status.heading, h)) < 1) return;
    await motor.roll(0, mod360(Math.round(h)));
    turns++;
    await wait(300);
    while (!status.isStill && !s.aborted) await wait(50);
  };
  /** Whether a notify arrives within 1 s at heading `h`. */
  const hears = async (h: number) => {
    await turnTo(h);
    await sensors.listenInfrared(true);
    const n = notifies, t = ctx.now();
    while (notifies === n && ctx.now() - t < 1000 && !done()) await wait(20);
    return notifies > n;
  };
  /** Edge of the zone heard at `from`, turning `dir` (+1 clockwise); null when heard all round. */
  const edge = async (from: number, dir: number) => {
    let inside = from, outside: number | null = null;
    for (let k = 1; k <= 9 && outside === null && !done(); k++) {
      const h = from + dir * 20 * k;
      if (await hears(h)) inside = h; else outside = h;
    }
    if (outside === null) return null;
    let deaf: number = outside;
    while (Math.abs(deaf - inside) > 5 && !done()) {
      const mid = (inside + deaf) / 2;
      if (await hears(mid)) inside = mid; else deaf = mid;
    }
    return (inside + deaf) / 2;
  };

  const display = (async () => {
    let shown = '';
    while (!done()) {
      const want = state === 'search' ? (shown === 'O' ? '' : 'O') : state === 'track' ? 'O' : 'U';
      if (want !== shown) await (want ? matrix.char(want, color) : matrix.clear());
      shown = want;
      await wait(state === 'search' ? 500 : 100);
    }
  })();

  while (!done()) {
    if (state === 'search') {
      if (ctx.now() - heard < 1000) state = enter('track');
      else { await wait(50); continue; }
    }
    if (state === 'track') {
      tracks++;
      const start = status.heading;
      const right = await edge(start, 1);
      const left = right === null ? null : await edge(start, -1);
      if (done()) break;
      if (right === null || left === null) { reason = 'all round'; break; }
      edges = [Math.round(left - start), Math.round(right - start)];
      await turnTo((left + right) / 2);
      side = 'unknown';
      const t = ctx.now();
      while (side === 'unknown' && ctx.now() - t < 10000 && !done()) {
        const r = await sensors.infraredReadings();
        const front = r[0] === channel || r[1] === channel, back = r[2] === channel || r[3] === channel;
        if (front !== back) side = front ? 'front' : 'back';
      }
      if (side === 'back') await turnTo(status.heading + 180);
      state = enter('locked');
      continue;
    }
    if (ctx.now() - heard > 1000) state = enter('search');
    else await wait(50);
  }

  reason ??= 'aborted';
  enter(state);
  await display;
  await matrix.clear();
  await motor.stop();
  while (!status.isStill && !s.aborted) await wait(50);
  await motor.stabilize(StabilizationIndex.none);
  await release();
  await offCollision();
  await offInfrared();
  ctx.log('info', `lockOn ${channel}: ${reason} after ${Math.round((ctx.now() - t0) / 1000)} s, ${tracks} tracks, ${turns} turns, edges ${edges.join('/')}, ${side}`);
  return { reason, time, notifies, turns, tracks, edges, side, heading: status.heading };
}
