import type { Bolt } from '../bolt';
import type { Context } from '../context';
import { LADDER, ROUND_MS } from './seek-to-collision';
import { PERIOD_MS, meanPhase, offBeat, volleyReader } from './infrared-timing';
import { angleDistance, mod360 } from '../helpers/math';
import { StabilizationIndex } from '../protocol/constants';
import { wait, whenAborted } from '../helpers/utils';

/**
 * sweep: the sender's direction from a standing turn.
 *
 * The seeker turns through `span` degrees in steps of `step`, stands one
 * ladder round at each heading and counts the frames per level. The
 * carrier is the weakest level heard at two headings or more. It is heard
 * with the sender within about 60 degrees of the fore-aft axis, either end,
 * and not abeam (seek-edge runs 1 to 8 at 1.0 to 1.6 m: strength 4 in 36 %
 * of the rounds ahead, 6 % abeam, 73 % behind), so the headings where it
 * was heard form an arc and the arc's centre is the sender's axis. Only
 * frames count. A dropped frame is a gap in the arc, bridged when it is a
 * single heading, never a wrong edge; the standing start of seekEdge, which
 * declared the edge on the first silence, did so inside the lobe in 5 of 8
 * runs. A 360 sweep hears the sender twice, through the front and through
 * the back; the longer arc is taken and the two are not joined round the
 * end of the sweep.
 *
 * Ahead or behind on the axis the notifies cannot say. The receivers can:
 * a read of them (0x22) names the pair that hears, and it lands in a frame
 * when it is timed to the sender's beat (2026-10-04, 80 cm: three reads per
 * beat caught 43 % of the frames, the front pair in 39 of 40 hits facing;
 * 2026-10-05: 1 beat in 10 at 1.5 m). The beat is learned from the notifies
 * while the sweep turns, then a volley is read on every beat. The receivers
 * sit at the corners, 45 degrees off the nose in front and 135 behind, so
 * a hit puts the sender within a quadrant of the heading plus the mean of
 * the corners that heard; the end of the axis nearer to that takes the
 * hit, and the end with more hits is the direction (trial 3, 2026-10-11:
 * three hits, 44 to 115 degrees off the axis, all on the true end).
 * Without a hit the axis is taken as ahead.
 *
 * Standing only; the ball ends pointing at the direction found. Ends on
 * fullstop. Records `sweep start` with the constants, one `sweep` line per
 * heading with the frames and the hits, `sweep arc` with the carrier, the
 * arc, the votes and the direction, `sweep trial` with the result.
 */
export interface SweepOptions {
  /** Degrees swept, centred on the heading at the start; 360 goes once round from it. */
  span?: number;
  /** Degrees between headings. */
  step?: number;
  /** Reads of the receivers per beat; 0 listens only, to measure the notifies' timing without them. */
  reads?: number;
}

export interface SweepResult {
  /** Headings stood at. */
  positions: number;
  /** Frames heard per ladder level over the sweep. */
  levels: number[];
  /** The level the arc was taken from, as a strength; null when nothing was heard. */
  carrier: number | null;
  /** Headings in the arc. */
  arc: number;
  /** Centre of the arc, a heading; null without a carrier. */
  axis: number | null;
  /** Hits that put the sender at the axis's near end, and at its far end. */
  front: number;
  back: number;
  known: 'front' | 'back' | null;
  /** The direction: the axis, or the axis turned by 180 when the back pair had the votes. */
  heading: number | null;
  volleys: number;
  hits: number;
  /** Notifies taken for the beat and ignored as off it; null when the beat was never learned. */
  beat: { onBeat: number, offBeat: number } | null;
  seconds: number;
}

interface Position {
  target: number;
  heading: number;
  frames: number[];
  volleys: number;
  hits: { channel: number, rx: string }[];
}

/**
 * `sender` sends the ladder while `seeker` sweeps, trial after trial, until
 * fullstop; a step `sweep` of the seeker. A trial begins when the seeker has
 * reported a collision (picked up, set down) and then none for `quietMs`,
 * so it has been placed: it shows the 'i' (armed) and starts on the next
 * report, a tap by hand. It blinks
 * the cross while sweeping and shows the chevron when it points at the
 * direction found, stabilization off, so it can be picked up and placed
 * again. Returns the trials' results.
 */
export function sweep (seeker: Bolt, sender: Bolt, options: SweepOptions = {}): Promise<SweepResult[]> {
  return seeker.run('sweep', () => trials(seeker, sender, options), { seeker: seeker.name, sender: sender.name, ...options });
}

async function trials (seeker: Bolt, sender: Bolt, options: SweepOptions): Promise<SweepResult[]> {

  const quietMs = 3000;  // no collision report for this long: the seeker stands where it was placed; chosen
  const tap = { xThreshold: 20, yThreshold: 20 };  // a hand's tap gives 20 to 34 (2026-10-10)

  const s = seeker.motion;
  const { matrix } = seeker.actuators;
  const results: SweepResult[] = [];
  let lastHit = -Infinity, handled = false, armed = false;
  let tapped = (): void => {};
  const offCollision = await seeker.sensors.collision.subscribe(() => {
    lastHit = seeker.now();
    handled = true;
    if (armed) tapped();
  }, tap);
  const sending = sender.experiments.sendLadder();
  const aborted = whenAborted(s);

  try {
    while (!s.aborted) {
      // placed: a report (picked up, set down) and then quiet
      while (!s.aborted && (!handled || seeker.now() - lastHit < quietMs)) await Promise.race([wait(handled ? quietMs - (seeker.now() - lastHit) : 200), aborted]);
      if (s.aborted) break;
      const hit = new Promise<void>((resolve) => { tapped = resolve; });
      armed = true;
      await matrix.animate('show', ['infra-listen']);
      seeker.log('info', `sweep armed ${results.length + 1}`);
      await Promise.race([hit, aborted]);
      armed = false;
      if (s.aborted) break;
      await matrix.animate('blink', ['tracking', 'infra-listen']);
      const result = await standing(seeker, options);
      results.push(result);
      await matrix.animate('show', ['cruising']);
      seeker.log('info', `sweep trial ${JSON.stringify({ n: results.length, ...result })}`);
      // the next trial waits for the seeker to be handled again
      handled = false;
    }
  } finally {
    await offCollision();
    sender.abortMotion();
    await sending.catch(() => undefined);
  }
  return results;
}

async function standing (seeker: Bolt, { span = 180, step = 15, reads = 3 }: SweepOptions): Promise<SweepResult> {

  const ctx: Context = seeker;
  const { actuators, sensors, status } = seeker;
  const { motor } = actuators;
  const s = ctx.motion;

  const roundMs   = ROUND_MS;
  const turnMs    = 600;   // a step's turn and its swing; as in seekEdge
  const firstMs   = 1000;  // the turn to the first heading and the one to the direction found, up to 180 degrees
  const offBeatMs = 25;    // a notify further off the beat is no correction of it; infrared-timing
  const msBefore  = 45;    // a volley's centre before the expected notify; infrared-timing run 5
  const stepMs    = 6;     // between the reads of a volley; infrared-timing run 5
  const names = ['FL', 'FR', 'BR', 'BL'];
  const corner: Record<string, number> = { FL: -45, FR: 45, BR: 135, BL: -135 };

  const heading = (): number => mod360(-(status.angles?.yaw ?? 0));
  const heardRound = LADDER.map(() => 0);
  const levels = LADDER.map(() => 0);
  const positions: Position[] = [];

  // the beat from the notifies, as trackBeat in infrared-timing.ts, learned while the sweep turns
  const learn: number[] = [];
  let phase: number | null = null;
  const beat = { onBeat: 0, offBeat: 0 };
  const offInfrared = await sensors.infrared.subscribe(({ payload }) => {
    const t = performance.now();
    const channel = payload[0] ?? 255;
    if (channel < LADDER.length) {
      heardRound[channel] = (heardRound[channel] ?? 0) + 1;
      levels[channel] = (levels[channel] ?? 0) + 1;
      if (phase === null) {
        learn.push(t);
        if (learn.length >= 20) {
          const rough = meanPhase(learn);
          const kept = learn.filter(x => Math.abs(offBeat(x, rough)) <= offBeatMs);
          phase = meanPhase(kept.length >= 8 ? kept : learn);
        }
      } else {
        const error = offBeat(t, phase);
        if (Math.abs(error) <= offBeatMs) {
          phase += 0.2 * error;
          beat.onBeat++;
        } else beat.offBeat++;
      }
    }
    // the listen is one-shot
    void sensors.listenInfrared(true);
  });
  await sensors.listenInfrared(true);
  await motor.stabilize(StabilizationIndex.full);
  const volley = await volleyReader(seeker);

  /**
   * Turn to `target` and give it `ms`, with the motion stream held only
   * that long; the heading at the end. During a round the stream is off:
   * its 18 packets a second share the link with the notifies and the
   * reads, and in trial 1 the notifies scattered 25 ms around the beat,
   * in clusters 15 to 20 ms apart, against 97 % within 25 ms without a
   * stream (2026-10-04); 1 hit in 51 volleys.
   */
  const pose = async (target: number | null, ms: number): Promise<number> => {
    const release = await sensors.motion.subscribe(null);
    if (target !== null) await motor.roll(0, target);
    await wait(ms);
    const at = heading();
    await release();
    return at;
  };

  const t0 = ctx.now();
  const start = await pose(null, turnMs);
  const count = span >= 360 ? Math.round(360 / step) : Math.floor(span / step) + 1;
  const first = span >= 360 ? start : start - span / 2;
  ctx.log('info', `sweep start ${JSON.stringify({ ladder: LADDER, span, step, count, start, roundMs, turnMs, firstMs, offBeatMs, msBefore, reads, stepMs })}`);

  const lead = msBefore + stepMs * (reads - 1) / 2;
  const next = (t: number): number => {
    const p = phase ?? 0;
    return p + Math.ceil((t - p) / PERIOD_MS) * PERIOD_MS;
  };
  let volleys = 0, hits = 0;

  for (let n = 0; n < count && !s.aborted; n++) {
    const target = mod360(first + n * step);
    const position: Position = { target, heading: await pose(target, n === 0 ? firstMs : turnMs), frames: [], volleys: 0, hits: [] };
    heardRound.fill(0);
    const tr = performance.now();
    while (performance.now() - tr < roundMs && !s.aborted) {
      if (reads === 0 || phase === null) {
        await wait(50);
        continue;
      }
      const payloads = await volley.read(next(performance.now() + lead + 12) - lead, reads, stepMs);
      position.volleys++;
      volleys++;
      for (const payload of payloads) {
        if (payload === null) continue;
        for (const channel of new Set(payload.filter(c => c < LADDER.length))) {
          position.hits.push({ channel, rx: names.filter((_, i) => payload[i] === channel).join('+') });
          hits++;
        }
      }
    }
    position.frames = [...heardRound];
    positions.push(position);
    ctx.log('info', `sweep ${JSON.stringify({ n, ...position })}`);
  }

  // the carrier: the weakest level heard at two headings or more, else at one
  const heardAt = LADDER.map((_, k) => positions.filter(p => (p.frames[k] ?? 0) > 0).length);
  let level = heardAt.findIndex(n => n >= 2);
  if (level < 0) level = heardAt.findIndex(n => n > 0);

  // the arc: the longest run of headings with the carrier heard, one silent heading inside bridged
  let arc: { from: Position, to: Position, headings: number } | null = null;
  if (level >= 0) {
    const flags = positions.map(p => (p.frames[level] ?? 0) > 0);
    for (let i = 0; i < flags.length; i++) {
      if (!flags[i]) continue;
      let j = i;
      while (j + 1 < flags.length && (flags[j + 1] || flags[j + 2])) j++;
      const from = positions[i], to = positions[j];
      if (from && to && (arc === null || j - i + 1 > arc.headings)) arc = { from, to, headings: j - i + 1 };
      i = j;
    }
  }
  const axis = arc === null ? null : mod360(arc.from.heading + angleDistance(arc.from.heading, arc.to.heading) / 2);

  // the vote: the corners that heard put the sender within a quadrant of the heading plus their mean; the nearer end of the axis takes the hit
  let front = 0, back = 0;
  const bearings: number[] = [];
  if (axis !== null) {
    for (const p of positions) {
      for (const hit of p.hits) {
        let sx = 0, sy = 0;
        for (const r of hit.rx.split('+')) {
          const a = (corner[r] ?? 0) * Math.PI / 180;
          sx += Math.cos(a);
          sy += Math.sin(a);
        }
        // opposite corners or all four say no side
        if (Math.hypot(sx, sy) < 0.5) continue;
        const bearing = mod360(p.heading + Math.atan2(sy, sx) * 180 / Math.PI);
        bearings.push(Math.round(bearing));
        if (Math.abs(angleDistance(axis, bearing)) < 90) front++;
        else back++;
      }
    }
  }
  const known = front > back ? 'front' : back > front ? 'back' : null;
  const direction = axis === null ? null : known === 'back' ? mod360(axis + 180) : axis;
  ctx.log('info', `sweep arc ${JSON.stringify({
    carrier: level >= 0 ? LADDER[level] : null, heardAt,
    arc: arc === null ? null : { from: arc.from.heading, to: arc.to.heading, headings: arc.headings },
    axis, bearings, front, back, known, direction,
  })}`);

  if (direction !== null && !s.aborted) {
    await motor.roll(0, direction);
    await wait(firstMs);
  }
  await motor.stop();
  await motor.stabilize(StabilizationIndex.none);
  volley.release();
  await offInfrared();

  return {
    positions: positions.length, levels,
    carrier: level >= 0 ? LADDER[level] ?? null : null,
    arc: arc === null ? 0 : arc.headings, axis,
    front, back, known,
    heading: direction, volleys, hits,
    beat: phase === null ? null : beat,
    seconds: Math.round((ctx.now() - t0) / 100) / 10,
  };
}
