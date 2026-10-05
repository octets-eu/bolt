import type { Actuators } from '../actuators/actuators';
import type { Bolt } from '../bolt';
import type { Context } from '../context';
import { trackBeat, volleyReader } from './infrared-timing';
import { angleDistance, distance, headingTo, mod360 } from '../helpers/math';
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
 * every 0.6 s. The channel of a listen notify says which level got through.
 * The weakest level that arrives carries the direction: it is heard with the
 * sender ahead or behind and falls silent with the sender abeam, while
 * stronger ones also arrive from the side (pass-by.ts, 2026-10-05). The
 * strengths are chosen.
 */
const LADDER = [4, 8, 16];

export interface SeekResult {
  /** Ladder rounds listened to. */
  rounds: number;
  /** Rounds in which the weakest arriving level was heard, and in which only stronger ones were. */
  heard: number;
  silent: number;
  /** Times a change of the weakest arriving level, with the way rolled since, said which half the sender is in. */
  trends: number;
  /** Standing checks of the front receivers against the back ones, and how many decided a half. */
  checks: number;
  decided: number;
  /** Times the pass rule stopped the ball beside the sender. */
  passes: number;
  /** Listen notifies on a ladder channel. */
  events: number;
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
 * may lie in, in the heading frame. It is fed by the listen notifies, one
 * ladder round at a time. In a round the weakest level that has been
 * arriving is either heard, which raises the directions ahead and behind,
 * or it is missing while a stronger level came through, which raises the
 * directions abeam. A round with no notify at all says nothing. The shape
 * of "ahead, abeam, behind" is `hearing`: chosen after two pass-by runs,
 * not a measured lobe, and no reading rules a direction out.
 *
 * The first version (2026-10-04) fed the belief from reads of the four
 * receivers (0x22). Untimed, about one read in a hundred fell into a frame:
 * the belief starved and the runs were given up.
 *
 * A notify names no receiver, so ahead and behind look alike, and `hearing`
 * is the same for both. In the first run on notifies (2026-10-05) it was
 * not, 0.75 against 0.7: the sweep put the sender 24 degrees off its true
 * direction, five rounds rolled toward it, then one silent round tipped the
 * belief to the opposite lobe and the ball rolled away. Two things tell the
 * ends apart now:
 *
 * - The check: standing, facing the likeliest direction, reads of the four
 *   receivers (0x22) timed to the sender's beat (infrared-timing.ts) for 20
 *   beats. Reads in which only the front pair shows a level against reads
 *   in which only the back pair does decide the half. It runs after the
 *   sweep and whenever the belief asks for a turn of more than 60 degrees.
 * - The range trend: when a weaker level starts to arrive after the ball
 *   has rolled a stretch, the sender lies in the half it rolled toward;
 *   when the weakest level is lost, in the half it came from. In that run
 *   it never applied: strength 4 kept arriving now and then out to 1.8 m.
 *
 * Start: standing, half a turn in 30 degree steps, two rounds per stop;
 * half a turn covers every direction. From then on the ball rolls and
 * steers after every round at the likeliest direction, of near equals the
 * one it faces; slower in a round that missed the weakest level, and
 * standing for a turn of more than 60 degrees.
 *
 * The pass. Second run on notifies (2026-10-05, 2 min, 1.5 m apart): the
 * sweep was 5 degrees off, the check read front 0, back 2 and took the
 * right half, the ball rolled 2 m straight and passed the sender by about
 * 30 cm. In the last 40 cm strength 4 was missing in three of four rounds,
 * but 13 heard rounds before had made the belief too sure to turn, and once
 * past, behind looks like ahead: it never changed direction. So the pass
 * has a rule of its own beside the belief: two silent rounds in a row after
 * the weakest level had been arriving stop the ball. Standing, the timed
 * reads then count the left receivers against the right ones; the belief
 * is set anew toward that side, or backward when they do not decide, and
 * from the first pass on the ball rolls at the slow speed.
 *
 * Logs `seek start` with the constants, one `seek` record per sweep stop
 * and per decision (the belief in thousandths, the levels heard, the rule
 * that applied), and `seek reads` with every reply of a standing check.
 */
export async function seek (seeker: Bolt): Promise<SeekResult> {

  const ctx: Context = seeker;
  const { actuators, sensors } = seeker;

  const cells      = 72;    // directions of the belief, 5 degrees each
  const roundMs    = 650;   // one ladder round of 615 ms and the notify's scatter: every level's frame falls into it
  const windowMs   = 3000;  // a level counts as arriving this long after it was heard; chosen
  const forget     = 0.02;  // share of the belief returned to "anywhere" per decision; chosen
  const sureWithin = 20;    // degrees round the likeliest direction that count as it
  const otherHalf  = 0.25;  // weight of the half a trend speaks against; chosen
  const trendCm    = 15;    // a level change says a half only after this much rolling; chosen
  const sweepStep  = 30;
  const turnMs     = 600;   // a 30 degree turn and its swing; chosen
  const sweepMs    = 2 * roundMs;
  const speed      = 30;    // chosen: about one round per 15 cm
  const slowSpeed  = 20;    // after a round that missed the weakest level; chosen
  const nearEqual  = 0.8;   // a direction this close to the likeliest counts as its equal; chosen
  const bigTurn    = 60;    // degrees; from here on the ball stands, turns and checks
  const bigTurnMs  = 1000;  // half a turn and its swing; chosen
  const checkBeats = 20;    // 4 s
  const checkBy    = 2;     // the pairs must differ by this many reads; chosen
  const passAfter  = 2;     // heard rounds among the four before two silent ones that make a pass; chosen

  /**
   * Share of the weakest arriving level's frames that are heard with the
   * sender `off` degrees from the front. Chosen after the pass-by runs of
   * 2026-10-05 (strength 4 at 72 cm: about 0.75 ahead, 0.08 abeam, 0.7
   * behind; silent from 75 to 120 degrees on one side, 60 to 105 on the
   * other), taken the same on both sides and the same ahead and behind.
   */
  const hearing = (off: number): number => {
    const a = Math.abs(off), fromAxis = a > 90 ? 180 - a : a;
    if (fromAxis <= 60) return 0.72;
    if (fromAxis < 70)  return 0.72 - (fromAxis - 60) / 10 * 0.64;
    return 0.08;
  };

  const s = ctx.motion;
  const { status } = ctx;
  const { motor } = actuators;

  let belief = new Array<number>(cells).fill(1 / cells);
  // when each level was last heard, and which were heard since the round began
  const heard = LADDER.map(() => -Infinity);
  const heardRound = LADDER.map(() => false);
  const eventsPerLevel = LADDER.map(() => 0);
  let rounds = 0, heardRounds = 0, silentRounds = 0, trends = 0, checks = 0, decided = 0, passes = 0, records = 0;

  const direction = (cell: number): number => cell * 360 / cells;
  /** Measured heading: the yaw counts the other way round. */
  const heading = (): number => mod360(-(status.angles?.yaw ?? 0));
  /** Weakest level heard within the window, or null. */
  const weakest = (): number | null => {
    const now = ctx.now(), level = heard.findIndex(t => now - t < windowMs);
    return level < 0 ? null : level;
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
  /**
   * Where to steer: the likeliest direction, or the likeliest of the
   * opposite half when that one is nearly as likely and nearer to `h`. The
   * two ends of the line come out near equal, and the ball keeps the one it
   * faces.
   */
  const steerAt = (h: number): number => {
    const at = peak().at;
    let other = -1;
    belief.forEach((v, cell) => {
      if (Math.abs(angleDistance(at, direction(cell))) > 90 && v > (belief[other] ?? 0)) other = cell;
    });
    const nearer = other >= 0 && Math.abs(angleDistance(h, direction(other))) < Math.abs(angleDistance(h, at));
    return nearer && (belief[other] ?? 0) >= nearEqual * Math.max(...belief) ? direction(other) : at;
  };
  /** What a round says with the ball facing `h`: the weakest arriving level came through, or it did not. */
  const feed = (h: number, came: boolean): void => {
    weigh(d => came ? hearing(angleDistance(h, d)) : 1 - hearing(angleDistance(h, d)));
    if (came) heardRounds++; else silentRounds++;
  };

  /** One ladder round of listening into the belief. */
  const round = async (): Promise<'heard' | 'silent' | 'none'> => {
    const before = weakest();
    heardRound.fill(false);
    await wait(roundMs);
    rounds++;
    const first = heardRound.indexOf(true);
    if (first < 0) return 'none';
    // a level weaker than the one arriving so far takes its place at once
    const carrier = before === null ? first : Math.min(before, first);
    const came = heardRound[carrier] === true;
    feed(heading(), came);
    return came ? 'heard' : 'silent';
  };

  /** One record; a sweep stop passes the heading and the levels it had. */
  const record = (rule: string, h = heading(), levels: readonly boolean[] = heardRound): void => {
    const { at, sure } = peak();
    ctx.log('info', `seek ${JSON.stringify({
      n: records++, rule,
      heading: Math.round(h), at: [Math.round(status.position.x), Math.round(status.position.y)],
      peak: at, sure: Math.round(sure * 100) / 100,
      weakest: weakest(), round: levels.map(v => v ? 1 : 0),
      rounds, heard: heardRounds, silent: silentRounds, trends, checks, decided, passes, events: eventsPerLevel,
      belief: belief.map(v => Math.round(v * 1000)),
    })}`);
  };

  // listen is one-shot: the beat tracker re-arms it after every notify, this listener only while there is none
  let rearm = false;
  const offInfrared = await sensors.infrared.subscribe(({ payload }) => {
    const channel = payload[0] ?? 255;
    if (channel < LADDER.length) {
      heard[channel] = ctx.now();
      heardRound[channel] = true;
      eventsPerLevel[channel] = (eventsPerLevel[channel] ?? 0) + 1;
    }
    if (rearm) void sensors.listenInfrared(true);
  });
  const release = await sensors.motion.subscribe(null);
  await motor.stabilize(StabilizationIndex.full);
  await ctx.events.once('sensordata', { timeoutMs: 1000 });
  ctx.log('info', `seek start ${JSON.stringify({ ladder: LADDER, cells, roundMs, windowMs, forget, sureWithin, otherHalf, trendCm, sweepStep, turnMs, sweepMs, speed, slowSpeed, nearEqual, bigTurn, bigTurnMs, checkBeats, checkBy })}`);

  // the sender's beat is learned from the notifies while the sweep stands; without it there is no check
  const learning = trackBeat(seeker, LADDER.map((_, channel) => channel));
  // not learned: the tracker has let go of the listen, this listener takes it over
  void learning.then((learned) => {
    if (learned !== null) return;
    rearm = true;
    void sensors.listenInfrared(true);
  });
  let beat = null as Awaited<typeof learning>;
  let volley = null as Awaited<ReturnType<typeof volleyReader>> | null;

  /**
   * Standing: reads of the four receivers on every beat, `checkBeats` of
   * them. Per beat, which receivers showed a level: front left, front
   * right, back right, back left. Logs every reply as `seek reads`.
   */
  const listen = async (why: string): Promise<boolean[][]> => {
    if (beat === null || volley === null) return [];
    const lead = 45 + 6;   // three reads 6 ms apart, centred 45 ms before the expected notify (infrared-timing.ts)
    const beats: boolean[][] = [], raw: (readonly number[] | null)[][] = [];
    for (let k = 0; k < checkBeats && !s.aborted; k++) {
      const replies = await volley.read(beat.next(performance.now() + lead + 12) - lead, 3, 6);
      raw.push(replies);
      beats.push([0, 1, 2, 3].map(i => replies.some(r => r !== null && (r[i] ?? 255) < LADDER.length)));
    }
    ctx.log('info', `seek reads ${JSON.stringify({ why, heading: Math.round(heading()), replies: raw })}`);
    return beats;
  };
  /** Beats in which only receivers of `a` showed a level, and only receivers of `b`. */
  const versus = (beats: readonly boolean[][], a: readonly number[], b: readonly number[]): [number, number] => {
    let onlyA = 0, onlyB = 0;
    for (const shows of beats) {
      const inA = a.some(i => shows[i] === true), inB = b.some(i => shows[i] === true);
      if (inA && !inB) onlyA++;
      if (inB && !inA) onlyB++;
    }
    return [onlyA, onlyB];
  };

  /**
   * Standing, facing `h`: is the sender ahead or behind? The half the pairs
   * decide for is kept, the other weighed down once per read of difference,
   * three at most.
   */
  const check = async (h: number): Promise<string> => {
    if (beat === null) return 'no beat';
    const [front, back] = versus(await listen('front against back'), [0, 1], [2, 3]);
    checks++;
    if (Math.abs(front - back) >= checkBy) {
      const toward = front > back ? h : h + 180;
      const weight = otherHalf ** Math.min(3, Math.abs(front - back));
      weigh(d => Math.abs(angleDistance(toward, d)) <= 90 ? 1 : weight);
      decided++;
    }
    return `check front ${front} back ${back}`;
  };

  // half a turn, standing: the stops are weighed once the weakest level of the whole sweep is known
  const h0 = heading();
  const stops: { h: number, levels: boolean[] }[] = [];
  for (let k = 0; k <= 180 / sweepStep && !s.aborted; k++) {
    await motor.roll(0, h0 + k * sweepStep);
    await wait(turnMs);
    heardRound.fill(false);
    await wait(sweepMs);
    rounds += 2;
    stops.push({ h: heading(), levels: [...heardRound] });
  }
  const carrier = LADDER.findIndex((_, level) => stops.some(stop => stop.levels[level] === true));
  for (const stop of stops) {
    if (carrier < 0) break;
    feed(stop.h, stop.levels[carrier] === true);
    record('sweep', stop.h, stop.levels);
  }

  beat = await learning;
  if (beat === null) ctx.log('warn', 'seek: the beat was not learned, no checks');
  else volley = await volleyReader(seeker);

  // roll, steering at the likeliest direction
  // where the weakest arriving level last changed
  let mark: { level: number | null, at: Point } = { level: weakest(), at: { ...status.position } };
  let slow = false, first = true, near = false;
  // what the rounds said since the ball last stood
  const verdicts: string[] = [];
  while (!s.aborted) {
    let target = steerAt(heading());
    if (first || Math.abs(angleDistance(heading(), target)) > bigTurn) {
      // standing: turn, then ask the receivers which end of the line it is
      await motor.roll(0, target);
      await wait(bigTurnMs);
      const h = heading();
      record(await check(h));
      target = steerAt(h);
      if (Math.abs(angleDistance(h, target)) > bigTurn) {
        await motor.roll(0, target);
        await wait(bigTurnMs);
      }
      first = false;
      verdicts.length = 0;
    }
    await motor.roll(slow || near ? slowSpeed : speed, target);
    const said = await round();
    verdicts.push(said);

    // the pass: the weakest level had been arriving and is silent twice in a row, so the sender is beside the ball
    const n = verdicts.length;
    if (said === 'silent' && verdicts[n - 2] === 'silent' && verdicts.slice(Math.max(0, n - 6), n - 2).filter(v => v === 'heard').length >= passAfter) {
      await motor.roll(0, heading());
      await wait(turnMs);
      const h = heading();
      const [left, right] = versus(await listen('left against right'), [0, 3], [1, 2]);
      const toward = Math.abs(left - right) < checkBy ? h + 180 : left > right ? h - 90 : h + 90;
      // the belief anew, a lobe toward that side: what it held before is what rolled past
      belief.fill(1 / cells);
      weigh((d) => {
        const off = angleDistance(toward, d);
        return 0.1 + (Math.abs(off) < 90 ? 0.9 * Math.cos(off * Math.PI / 180) ** 2 : 0);
      });
      passes++;
      near = true;
      slow = false;
      verdicts.length = 0;
      mark = { level: weakest(), at: { ...status.position } };
      record(`pass left ${left} right ${right}`);
      continue;
    }
    belief = belief.map(v => (1 - forget) * v + forget / cells);
    slow = said === 'silent';

    let rule: string = said;
    const level = weakest();
    if (level !== mark.level) {
      if (level !== null && mark.level !== null && distance(mark.at, status.position) >= trendCm) {
        // a weaker level arrives: the sender is where the ball rolled to; the weakest is lost: where it came from
        const closer = level < mark.level;
        const toward = headingTo(mark.at, status.position) + (closer ? 0 : 180);
        weigh(d => Math.abs(angleDistance(toward, d)) <= 90 ? 1 : otherHalf);
        trends++;
        rule = closer ? 'closer' : 'farther';
      }
      mark = { level, at: { ...status.position } };
    }
    record(rule);
  }

  await motor.stop();
  await motor.stabilize(StabilizationIndex.none);
  volley?.release();
  await beat?.release();
  await release();
  await offInfrared();
  return { rounds, heard: heardRounds, silent: silentRounds, trends, checks, decided, passes, events: eventsPerLevel.reduce((a, n) => a + n, 0) };
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
  const seeking = seek(seeker);
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
