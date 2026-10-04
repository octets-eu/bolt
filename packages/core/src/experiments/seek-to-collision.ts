import type { Actuators } from '../actuators/actuators';
import type { Bolt } from '../bolt';
import type { Context } from '../context';
import type { Sensors } from '../sensors/sensors';
import { angleDistance, distance, mod360 } from '../helpers/math';
import type { Point } from '../helpers/math';
import { StabilizationIndex } from '../protocol/constants';
import { wait } from '../helpers/utils';

/**
 * seekToCollision: one Bolt sends an infrared ladder, the other finds it and
 * drives into it. `sendLadder` is the sender, `seek` the seeker,
 * `seekToCollision` starts both and ends them.
 *
 * The ladder: channel k carries strength LADDER[k], weakest first, one frame
 * per 200 ms (a Bolt emits no faster, 2026-10-01), so each level comes round
 * every 0.8 s. The channel a receiver reports says which level got through.
 * The weakest level that arrives carries the direction; stronger ones also
 * arrive from the side and by reflection. The strengths are chosen.
 */
const LADDER = [2, 4, 8, 16];

export interface SeekResult {
  /** Where the first check put the sender; null when neither pair heard and the sweep went all round. */
  half: 'front' | 'back' | null;
  polls: number;
  /** Ladder levels the front receivers reported. */
  hits: number;
  /** Listen notifies on a ladder channel. */
  events: number;
  returns: number;
}

export interface SeekToCollisionResult {
  reason: 'collision' | 'obstacle' | 'time' | 'stopped' | 'error';
  seconds: number;
  /** Milliseconds between the two collision reports; null unless the reason is 'collision'. */
  gapMs: number | null;
  /** Frames the sender sent; null when it failed. */
  frames: number | null;
  seek: SeekResult | null;
}

/** Send the ladder, level after level, until fullstop. Returns the frames sent. */
export async function sendLadder (ctx: Context, actuators: Actuators): Promise<number> {
  const s = ctx.motion;
  let frames = 0;
  while (!s.aborted) {
    for (const [channel, strength] of LADDER.entries()) {
      if (s.aborted) break;
      const t = ctx.now();
      await actuators.infrared.send(channel, strength);
      frames++;
      await wait(Math.max(0, 200 - (ctx.now() - t)));
    }
  }
  return frames;
}

/**
 * Find the Bolt that sends the ladder and roll into it, until fullstop.
 * Motor commands only, its own loop.
 *
 * The seeker holds a belief: a probability for each direction the sender
 * may lie in, in the heading frame. Every poll of the receivers (0x22)
 * weighs it with a lobe that is theory, not measurement: a front receiver
 * hears best along its axis and not at all from 90 degrees off it, cos²
 * between. A lobe measured in one room holds for that room and floor only.
 * A hit raises the directions in the receiver's lobe, silence lowers them a
 * little, and no reading rules a direction out: a share of the hits is
 * taken to be stray, the more so the stronger the level is against the
 * weakest one arriving.
 *
 * Start: standing, front pair against back pair tells the half the sender
 * is in; then a sweep over that half in 30 degree steps, all round when
 * neither pair heard. From then on the ball rolls and steers at the
 * likeliest direction on every decision.
 *
 * The back receivers serve one decision, the return: the locator says the
 * sender was passed, further rolled than the reach of the weakest level
 * heard, and the back pair hears a weaker level than the front pair.
 *
 * Logs `seek start` with the constants and one `seek` record per decision:
 * the belief in thousandths, the levels heard, the rule that steered.
 */
export async function seek (ctx: Context, actuators: Actuators, sensors: Sensors): Promise<SeekResult> {

  const cells         = 72;                 // directions of the belief, 5 degrees each
  const axes          = [-45, 45];          // front left and front right receiver, degrees from the front; chosen
  const stray         = [0.2, 0.4, 0.7, 0.9]; // share of stray hits, by levels above the weakest arriving; chosen
  const catchPerLevel = 8 / (LADDER.length * 200); // a poll sees a level while its frame is in the air, 8 ms of each cycle
  const forget        = 0.02;               // share of the belief returned to "anywhere" per decision; chosen
  const sureWithin    = 20;                 // degrees round the likeliest direction that count as it
  const windowMs      = 3000;               // a level counts as arriving this long after it was heard; chosen
  const checkMs       = 2000;               // standing, front against back; chosen
  const otherHalf     = 0.25;               // weight of the half the check did not pick; chosen
  const sweepStep     = 30;
  const sweepMs       = 1200;               // per step, the turn included; chosen
  const decideMs      = 400;
  const speed         = 60;                 // chosen
  const closeSpeed    = 40;                 // while the weakest level arrives; the exploring speed of reach.ts
  const reachCm       = LADDER.map(strength => 400 * Math.sqrt(strength / 16)); // inverse square law from strength 16 reaching 4 m (2026-10-02)

  const s = ctx.motion;
  const { status } = ctx;
  const { motor } = actuators;

  let belief = new Array<number>(cells).fill(1 / cells);
  // when each level was last heard: at all, by the front pair, by the back pair
  const heard = LADDER.map(() => -Infinity), heardFront = [...heard], heardBack = [...heard];
  const eventsPerLevel = LADDER.map(() => 0);
  let polls = 0, hits = 0, returns = 0, records = 0;

  const direction = (cell: number): number => cell * 360 / cells;
  /** Measured heading: the yaw counts the other way round. */
  const heading = (): number => mod360(-(status.angles?.yaw ?? 0));
  /** Weakest level in `times` heard within the window, or null. */
  const weakest = (times: readonly number[]): number | null => {
    const now = ctx.now(), level = times.findIndex(t => now - t < windowMs);
    return level < 0 ? null : level;
  };
  /** What a hit `above` the weakest level says for direction `d`, the receiver looking along `axis`. */
  const lobe = (d: number, axis: number, above: number): number => {
    const share = stray[Math.min(above, stray.length - 1)] ?? 1;
    const off = angleDistance(axis, d);
    return share + (1 - share) * (Math.abs(off) < 90 ? Math.cos(off * Math.PI / 180) ** 2 : 0);
  };
  /** Multiply the belief by `weight` per direction and scale it back to 1. */
  const weigh = (weight: (d: number) => number): void => {
    belief = belief.map((v, cell) => v * weight(direction(cell)));
    const sum = belief.reduce((a, v) => a + v, 0);
    belief = belief.map(v => v / sum);
  };
  const peak = (): { at: number, sure: number } => {
    const at = direction(belief.indexOf(Math.max(...belief)));
    const sure = belief.reduce((a, v, cell) => Math.abs(angleDistance(at, direction(cell))) <= sureWithin ? a + v : a, 0);
    return { at, sure };
  };

  /** One reading of the four receivers into the belief. */
  const poll = async (): Promise<void> => {
    const r = await sensors.infraredReadings();
    const now = ctx.now(), h = heading();
    polls++;
    r.forEach((channel, i) => {
      if (channel >= LADDER.length) return;
      heard[channel] = now;
      (i < 2 ? heardFront : heardBack)[channel] = now;
    });
    const floor = weakest(heard) ?? 0;
    const arriving = heard.filter(t => now - t < windowMs).length;
    axes.forEach((axis, i) => {
      const channel = r[i] ?? 255;
      if (channel === 255) weigh(d => 1 - arriving * catchPerLevel * lobe(d, h + axis, 0));
      else if (channel < LADDER.length) {
        hits++;
        weigh(d => lobe(d, h + axis, channel - floor));
      }
    });
  };

  const record = (rule: string, half?: SeekResult['half']): void => {
    const { at, sure } = peak();
    ctx.log('info', `seek ${JSON.stringify({
      n: records++, rule, half,
      heading: Math.round(heading()), at: [Math.round(status.position.x), Math.round(status.position.y)],
      peak: at, sure: Math.round(sure * 100) / 100,
      weakest: weakest(heard), front: weakest(heardFront), back: weakest(heardBack),
      polls, hits, events: eventsPerLevel, returns,
      belief: belief.map(v => Math.round(v * 1000)),
    })}`);
  };

  // listen is one-shot: re-arm after every notify
  const offInfrared = await sensors.infrared.subscribe(({ payload }) => {
    const channel = payload[0] ?? 255;
    if (channel < LADDER.length) {
      heard[channel] = ctx.now();
      eventsPerLevel[channel] = (eventsPerLevel[channel] ?? 0) + 1;
    }
    void sensors.listenInfrared(true);
  });
  const release = await sensors.motion.subscribe(null);
  await motor.stabilize(StabilizationIndex.full);
  await ctx.events.once('sensordata', { timeoutMs: 1000 });
  await sensors.listenInfrared(true);
  ctx.log('info', `seek start ${JSON.stringify({ ladder: LADDER, cells, axes, stray, catchPerLevel, forget, sureWithin, windowMs, checkMs, otherHalf, sweepStep, sweepMs, decideMs, speed, closeSpeed, reachCm: reachCm.map(Math.round) })}`);

  // front against back, standing
  const h0 = heading(), checked = ctx.now();
  while (!s.aborted && ctx.now() - checked < checkMs) await poll();
  const front = weakest(heardFront), back = weakest(heardBack);
  const half = front === null && back === null ? null : back !== null && (front === null || back < front) ? 'back' : 'front';
  const middle = half === 'back' ? h0 + 180 : h0;
  if (half !== null) weigh(d => Math.abs(angleDistance(middle, d)) <= 90 ? 1 : otherHalf);
  record('check', half);

  // sweep the half, all round when the check heard nothing
  const first = half === null ? h0 : middle - 90, stops = half === null ? 360 / sweepStep : 180 / sweepStep + 1;
  for (let k = 0; k < stops && !s.aborted; k++) {
    await motor.roll(0, first + k * sweepStep);
    const t = ctx.now();
    while (!s.aborted && ctx.now() - t < sweepMs) await poll();
    record('sweep');
  }

  // roll, steering at the likeliest direction
  let decided = ctx.now();
  // where the weakest level so far was first heard: within its reach of there the sender should be met
  let mark: { level: number, at: Point } | null = null;
  while (!s.aborted) {
    await poll();
    const now = ctx.now();
    if (now - decided < decideMs) continue;
    decided = now;
    belief = belief.map(v => (1 - forget) * v + forget / cells);

    const level = weakest(heard), ahead = weakest(heardFront), behind = weakest(heardBack);
    if (level !== null && (mark === null || level < mark.level)) mark = { level, at: { ...status.position } };
    let rule = 'peak';
    if (mark !== null && distance(status.position, mark.at) > (reachCm[mark.level] ?? 0) && behind !== null && (ahead === null || behind < ahead)) {
      const reverse = heading() + 180;
      belief.fill(1);
      weigh(d => lobe(d, reverse, 0));
      mark = null;
      returns++;
      rule = 'return';
    }
    await motor.roll(level === 0 ? closeSpeed : speed, peak().at);
    record(rule);
  }

  await motor.stop();
  await motor.stabilize(StabilizationIndex.none);
  await release();
  await offInfrared();
  return { half, polls, hits, events: eventsPerLevel.reduce((a, n) => a + n, 0), returns };
}

/**
 * Run the experiment: `sender` sends the ladder, `seeker` seeks, until both
 * report a collision at the same moment, the seeker alone reports one
 * ('obstacle': whatever it hit, the sender is at least a metre off),
 * `seconds` have passed, or a fullstop (STOP, space) reaches either. A hit
 * that fires no collision report ends nothing: that is for STOP. When one
 * of the two fails, the other is stopped as well. Logs `seekToCollision start` and `seekToCollision end`
 * with the result.
 */
export async function seekToCollision (seeker: Bolt, sender: Bolt, seconds = 60): Promise<SeekToCollisionResult> {

  const windowMs   = 300;  // both reports within this are one contact; chosen
  // the standing sender should report a touch; the rolling seeker at 40 reports wall bumps and the ramp lip (2026-09-17); chosen
  const thresholds = { seeker: { xThreshold: 40, yThreshold: 40 }, sender: { xThreshold: 20, yThreshold: 20 } };

  const t0 = seeker.now();
  let reason = null as SeekToCollisionResult['reason'] | null;
  let finish = (): void => {};
  const ended = new Promise<void>((resolve) => { finish = resolve; });
  const end = (r: SeekToCollisionResult['reason']): void => {
    if (reason !== null) return;
    reason = r;
    finish();
  };

  const hit = { seeker: -Infinity, sender: -Infinity };
  const onHit = (who: keyof typeof hit) => (): void => {
    hit[who] = seeker.now();
    if (Math.abs(hit.seeker - hit.sender) <= windowMs) end('collision');
    // the seeker alone hit something else, unless the sender's report follows
    else if (who === 'seeker') setTimeout(() => {
      if (!(Math.abs(hit.seeker - hit.sender) <= windowMs)) end('obstacle');
    }, windowMs);
  };
  const offSeeker = await seeker.sensors.collision.subscribe(onHit('seeker'), thresholds.seeker);
  const offSender = await sender.sensors.collision.subscribe(onHit('sender'), thresholds.sender);
  const stopped = new Set<Bolt>();
  const offStops = [seeker, sender].map(bolt => bolt.events.on('fullstop', () => {
    stopped.add(bolt);
    end('stopped');
  }));
  const timer = setTimeout(() => end('time'), seconds * 1000);

  seeker.log('info', `seekToCollision start ${JSON.stringify({ seeker: seeker.name, sender: sender.name, seconds, ladder: LADDER, windowMs, thresholds })}`);
  const sending = sender.experiments.sendLadder();
  const seeking = seeker.experiments.seek();
  sending.catch(() => end('error'));
  seeking.catch(() => end('error'));
  await ended;

  clearTimeout(timer);
  await Promise.allSettled([seeker, sender].filter(bolt => !stopped.has(bolt)).map(bolt => bolt.lifecycle.fullstop()));
  const [frames, sought] = await Promise.allSettled([sending, seeking]);
  for (const off of offStops) off();

  const result: SeekToCollisionResult = {
    reason: reason ?? 'error',
    seconds: Math.round((seeker.now() - t0) / 100) / 10,
    gapMs: reason === 'collision' ? Math.abs(hit.seeker - hit.sender) : null,
    frames: frames.status === 'fulfilled' ? frames.value : null,
    seek: sought.status === 'fulfilled' ? sought.value : null,
  };
  seeker.log('info', `seekToCollision end ${JSON.stringify(result)}`);
  await offSeeker();
  await offSender();
  return result;
}
