import type { Bolt } from '../bolt';
import type { Referee } from '../referee/referee';
import { LADDERS } from '../communication/communication';
import { angleDistance, distance, headingTo, mod360 } from '../helpers/math';
import type { Point } from '../helpers/math';
import { StabilizationIndex } from '../protocol/constants';
import { wait } from '../helpers/utils';
import type { SweepOptions, SweepResult } from '../behavior/sweep';

export type ApproachOptions = Omit<SweepOptions, 'referee' | 'range'>;

export interface ApproachResult {
  /** dash: the sender is in the dash band and `heading` points at it. nothing: a sweep found no direction. */
  reason: 'dash' | 'nothing' | 'aborted';
  heading: number | null;
  legs: number;
  shortLegs: number;
  sweeps: number;
  rounds: number;
  seconds: number;
}

/**
 * approach: from a sweep's direction to the dash band. The sweep gives the
 * sender's heading; the seeker holds the sender `edge` degrees off its
 * nose and tacks toward it on the long ladder, the legs and the carrier
 * as in seekEdge (seek-edge.ts): a round in which the carrier is heard
 * turns a step away from the sender's side, a round in which it is silent
 * while a stronger level came through a step toward it; a leg ends after
 * `legCm` or when the carrier has been silent `slidOut` rounds in a row,
 * then the ball turns through the sender to the other edge. Two rules are
 * new against seekEdge, whose standing start, belief and dash are gone:
 *
 * - The carrier is the weakest level the sweep fitted, the one with a lobe
 *   at this distance; a weaker level heard on the way takes over, since
 *   the ball is nearer. The weakest level heard at all would not do: a
 *   level heard all round says heard every round and turns the ball away
 *   until the sender is behind.
 * - Lost: a full leg in which the carrier was not heard once while
 *   stronger levels were, or `noneMax` rounds that say nothing. The ball
 *   stands, sweeps again on the long ladder and holds the new direction at
 *   the edge.
 * - Near: a frame of the long ladder's weakest level, which does not reach
 *   far. The ball stands and sweeps on the short ladder, the referee
 *   switching the sender. The
 *   short ladder's weakest level fitted with a direction is the dash band:
 *   done, `heading` is the direction. A direction from stronger levels
 *   only: roll `stretchCm` along it and sweep again. No direction: too
 *   close, back off `backCm` along the last direction and sweep again.
 *   `shortMax` short sweeps without the band give up.
 *
 * Logs `approach start` with the constants and one `approach` line per
 * round, leg, sweep and rule, with the heading and the locator position.
 */
export async function approach (seeker: Bolt, referee: Referee, options: ApproachOptions = {}): Promise<ApproachResult> {

  const ctx = seeker;
  const { actuators, sensors, status, behavior } = seeker;
  const { motor } = actuators;
  const s = ctx.motion;
  const t0 = ctx.now();

  const edge         = 65;    // degrees off the nose the sender is held at; chosen
  const step         = 10;    // degrees per verdict; chosen
  const turnMs       = 600;   // a step's turn and its swing; chosen
  const tackMs       = 1000;  // a 130 degree turn and its swing; chosen
  const legCm        = 40;    // chosen
  const slidOut      = 2;     // silent rounds in a row that end a leg; chosen
  const minLegCm     = 10;    // a leg shorter than this is not cut; chosen
  const noneMax      = 3;     // rounds without a notify that count as lost; chosen
  const speed        = 20;    // chosen
  const stretchCm    = 30;    // along a short-ladder direction from stronger levels; chosen
  const backCm       = 20;    // back along the last direction when too close; chosen
  const shortMax     = 6;     // short sweeps before giving up; chosen

  const long = LADDERS.long;
  const heading = (): number => mod360(-(status.angles?.yaw ?? 0));
  const result: ApproachResult = { reason: 'aborted', heading: null, legs: 0, shortLegs: 0, sweeps: 0, rounds: 0, seconds: 0 };
  let records = 0;

  // notifies of the running round and of the running leg, on the long ladder, while rolling
  const heardRound = long.channels.map(() => 0);
  const legHeard = long.channels.map(() => 0);
  let offInfrared: (() => Promise<void>) | null = null, releaseMotion: (() => Promise<void>) | null = null;

  /** Hold the streams for rolling: the notifies and the locator. */
  const roll = async (): Promise<void> => {
    offInfrared ??= await sensors.infrared.subscribe(({ payload }) => {
      const k = long.channels.indexOf(payload[0] ?? 255);
      if (k >= 0) {
        heardRound[k] = (heardRound[k] ?? 0) + 1;
        legHeard[k] = (legHeard[k] ?? 0) + 1;
        if (carrierLevel !== null && k < carrierLevel) carrierLevel = k;
      }
      void sensors.listenInfrared(true);
    });
    await sensors.listenInfrared(true);
    releaseMotion ??= await sensors.motion.subscribe(null);
    await motor.stabilize(StabilizationIndex.full);
    await ctx.events.once('sensordata', { timeoutMs: 1000 });
  };
  /** Let go of both before a sweep: it holds its own, and the motion packets smear its notifies. */
  const stand = async (): Promise<void> => {
    await motor.stop();
    await offInfrared?.();
    await releaseMotion?.();
    offInfrared = releaseMotion = null;
  };

  const record = (rule: string, extra: object = {}): void => {
    ctx.log('info', `approach ${JSON.stringify({ n: records++, rule, heading: Math.round(heading()), at: [Math.round(status.position.x), Math.round(status.position.y)], ...extra })}`);
  };

  const sweepOn = async (range: 'long' | 'short'): Promise<SweepResult> => {
    await stand();
    const r = await behavior.sweep({ referee, range, ...options });
    result.sweeps++;
    record('sweep', { range, reason: r.reason, direction: r.heading, used: r.used, hits: r.hits });
    return r;
  };

  // the carrier: the weakest level the last sweep fitted, as an index into the long ladder; a weaker level heard takes over
  let carrierLevel: number | null = null;
  const carrierOf = (sweep: SweepResult): number | null => {
    const k = long.strengths.indexOf(sweep.used[0] ?? -1);
    return k >= 0 ? k : null;
  };

  /** One round of listening: what the carrier said. */
  const round = async (): Promise<'heard' | 'silent' | 'none'> => {
    heardRound.fill(0);
    await wait(long.roundMs);
    result.rounds++;
    const c = carrierLevel;
    return c === null ? 'none'
      : (heardRound[c] ?? 0) > 0 ? 'heard'
      : heardRound.some((n, k) => k > c && n > 0) ? 'silent'
      : 'none';
  };

  ctx.log('info', `approach start ${JSON.stringify({ ladder: long.strengths, edge, step, turnMs, tackMs, legCm, slidOut, minLegCm, noneMax, speed, stretchCm, backCm, shortMax })}`);

  try {
    // the direction, then the sender held at the edge
    let sweep = await sweepOn('long');
    if (sweep.heading === null) {
      result.reason = s.aborted ? 'aborted' : 'nothing';
      return result;
    }
    let side = 1, target = sweep.heading - side * edge;
    let lastDirection = sweep.heading;
    carrierLevel = carrierOf(sweep);
    await roll();
    await motor.roll(0, mod360(target));
    await wait(turnMs);
    legHeard.fill(0);

    // the legs
    let legFrom: Point = { ...status.position }, legNet = 0, silentRun = 0, noneRun = 0;
    let near = false;
    while (!s.aborted && !near) {
      await motor.roll(speed, mod360(target));
      const said = await round();
      const c = carrierLevel;
      noneRun = said === 'none' ? noneRun + 1 : 0;

      if ((heardRound[0] ?? 0) > 0) {
        near = true;
        record('near', { round: [...heardRound] });
        break;
      }

      const turn = said === 'heard' ? -side * step : said === 'silent' ? side * step : 0;
      target += turn;
      legNet += turn;
      silentRun = said === 'silent' ? silentRun + 1 : said === 'heard' ? 0 : silentRun;
      const legLen = distance(legFrom, status.position);
      const short = silentRun >= slidOut && legLen >= minLegCm && legLen < legCm;
      const full = legLen >= legCm;
      const lost = noneRun >= noneMax || (full && c !== null && (legHeard[c] ?? 0) === 0 && legHeard.some((n, k) => k > c && n > 0));
      if (lost) {
        record('lost', { carrier: c, legHeard: [...legHeard], noneRun });
        sweep = await sweepOn('long');
        if (sweep.heading === null) {
          result.reason = s.aborted ? 'aborted' : 'nothing';
          return result;
        }
        lastDirection = sweep.heading;
        target = sweep.heading - side * edge;
        carrierLevel = carrierOf(sweep);
        await roll();
        await motor.roll(0, mod360(target));
        await wait(turnMs);
        legHeard.fill(0);
        legFrom = { ...status.position };
        legNet = silentRun = noneRun = 0;
        continue;
      }
      if (short || full) {
        if (short) result.shortLegs++;
        result.legs++;
        lastDirection = mod360(target + side * edge);
        target += side * 2 * edge;
        side = -side;
        await motor.roll(0, mod360(target));
        await wait(tackMs);
        record(short ? 'tack short' : 'tack', { legLen: Math.round(legLen), legNet, carrier: c, legHeard: [...legHeard] });
        legHeard.fill(0);
        legFrom = { ...status.position };
        legNet = silentRun = 0;
        continue;
      }
      record(said, { carrier: c, round: [...heardRound], side, legNet });
    }
    if (s.aborted) return result;

    // the dash band, on the short ladder
    for (let n = 0; n < shortMax && !s.aborted; n++) {
      sweep = await sweepOn('short');
      if (s.aborted) break;
      if (sweep.heading !== null && sweep.used.includes(LADDERS.short.strengths[0] ?? 1)) {
        result.reason = 'dash';
        result.heading = sweep.heading;
        return result;
      }
      if (sweep.heading !== null) {
        lastDirection = sweep.heading;
        record('stretch', { direction: sweep.heading, cm: stretchCm });
        await seeker.navigation.roll(stretchCm, sweep.heading);
      } else {
        record('back off', { direction: lastDirection, cm: backCm });
        await seeker.navigation.roll(backCm, mod360(lastDirection + 180));
      }
    }
    if (!s.aborted) result.reason = 'nothing';
    return result;
  } finally {
    await stand();
    await motor.stabilize(StabilizationIndex.none);
    result.seconds = Math.round((ctx.now() - t0) / 100) / 10;
  }
}

export interface ApproachTestOptions extends ApproachOptions {
  /** Where the sender stands, in the seeker's locator frame, cm. */
  at: Point;
  /** The walk's direction, a heading in the seeker's locator frame, and its length. */
  direction: number;
  startCm: number;
}

export interface ApproachTestResult extends ApproachResult {
  /** The locator's distance to the sender at the end, and the dash heading's error against the bearing. */
  cm: number;
  error: number | null;
}

/**
 * The approach judged by the locator: both Bolts on their reference points,
 * hard reset, the referee runs the ladder; the seeker walks `startCm` along
 * `direction`, turns by a random angle and approaches. Logged as
 * `approachTest` with the result, the distance to the sender at the end and
 * the dash heading's error.
 */
export function approachTest (referee: Referee, options: ApproachTestOptions): Promise<ApproachTestResult> {
  const { seeker, sender } = referee;
  return seeker.run('approachTest', () => run(referee, options), { seeker: seeker.name, sender: sender.name, ...options });
}

async function run (referee: Referee, { at, direction, startCm, ...options }: ApproachTestOptions): Promise<ApproachTestResult> {
  const { seeker, sender } = referee;
  const { status, communication } = seeker;
  await Promise.all([seeker.lifecycle.reset(), sender.lifecycle.reset()]);
  referee.start();
  try {
    await communication.state('motor', 'cruising');
    await seeker.navigation.roll(startCm, direction);
    await seeker.navigation.rotate(Math.round(Math.random() * 360));
    await communication.state('motor', null);
    const result = await approach(seeker, referee, options);
    const position = { ...status.position };
    const bearing = headingTo(position, at);
    const error = result.heading === null ? null : Math.round(angleDistance(bearing, result.heading));
    const test: ApproachTestResult = { ...result, cm: Math.round(distance(position, at)), error };
    await communication.state('motor', result.reason === 'dash' ? 'cruising' : 'lost');
    seeker.log('info', `approachTest ${JSON.stringify(test)}`);
    return test;
  } finally {
    await communication.state('motor', null);
    await referee.end();
  }
}
