import type { Actuators } from '../actuators/actuators';
import type { Communication } from '../communication/communication';
import type { Ladder, LadderRange } from '../communication/communication';
import type { LadderAuthority } from '../referee/referee';
import { negotiateLadder } from './negotiate-ladder';
import type { NegotiateResult } from './negotiate-ladder';
import type { Context } from '../context';
import type { Sensors } from '../sensors/sensors';
import { angleDistance, mod360 } from '../helpers/math';
import { StabilizationIndex } from '../protocol/constants';
import { wait } from '../helpers/utils';
import { readVolley, trackBeat } from './beat';
import type { Beat } from './beat';

export interface SweepOptions {
  /** Whom to ask for the ladder before listening. */
  referee: LadderAuthority;
  /** The ladder to sweep on. */
  range?: LadderRange | undefined;
  /** Degrees swept, centred on the heading at the start; 360 goes once round from it. */
  span?: number | undefined;
  /** Degrees between headings. */
  step?: number | undefined;
  /** Reads of the receivers per volley on the axis. */
  reads?: number | undefined;
}

export interface SweepResult {
  /**
   * direction: the axis and its end are known. nothing: no level was heard
   * at some headings and silent at others, the sender is out of reach or on
   * top; or no read on the axis named an end.
   */
  reason: 'direction' | 'nothing' | 'aborted';
  /** The ladder swept on, and whether a frame of it confirmed the switch before the sweep. */
  range: LadderRange;
  negotiated: NegotiateResult['reason'];
  /** The direction found, a heading; null for nothing and aborted. */
  heading: number | null;
  /** Levels the fit used, as strengths. */
  used: number[];
  /** Frames heard per ladder level while turning. */
  levels: number[];
  /** Reads on the axis that named a side. */
  hits: number;
  seconds: number;
}

/** One heading stood at: asked for, read at the end of the turn, and the frames heard there per ladder level. */
interface Position { target: number; heading: number; frames: number[] }

const turnMs    = 600;    // a step's turn and its swing; as in seekEdge
const firstMs   = 1000;   // the turn to the first heading, to the axis and to the direction found, up to 180 degrees
const msBefore  = 45;     // a volley's centre before the expected notify; infrared-timing run 5
const stepMs    = 6;      // between the reads of a volley; infrared-timing run 5
const half      = 60;     // half-width of a lobe, degrees
const heardMin  = 3;      // headings a level is heard at, at least, to be fitted; fewer is stray frames; chosen
const silentMin = 2;      // and silent at, at least; chosen
const endRounds = 10;     // ladder rounds the reads on the axis get before the sweep gives up; chosen
const agree     = 2;      // hits on one side that decide the end; chosen
/** Where the receivers sit, degrees off the nose: front left, front right, back right, back left. */
const corners   = [-45, 45, 135, -135];
const names     = ['FL', 'FR', 'BR', 'BL'];

/**
 * Where another Bolt is, from a standing turn. The other Bolt sends a
 * ladder (Communication.sendLadder), negotiated first with the referee
 * (negotiate-ladder.ts) so it holds for the sweep. Three steps, each a
 * function below:
 *
 * 1. sweepForAxis: turn through `span` degrees in steps of `step`, stand one
 *    ladder round at each heading, count the frames per level, and fit two
 *    lobes to the heard and silent headings. The result is a line through
 *    this Bolt, the axis, with the sender at one of its ends; the notifies
 *    cannot say which, since the rear lobe hears as well as the front one.
 * 2. sweepForDirection: face the axis and read the receivers, timed into the
 *    sender's frames (beat.ts). The four sit at the corners, so a read that
 *    lands says whether the sender is ahead or behind. Two reads on one side
 *    decide; `endRounds` ladder rounds without that is nothing.
 * 3. Face the direction found.
 *
 * Motor commands only, its own loop. Shows 'tracking' while it runs. Ends
 * pointing at the direction found, or where the reads ended when there is
 * none, stabilization off. Ends on fullstop. Records `sweep start` with the
 * constants, one `sweep` line per heading with the frames, `sweep axis`
 * with the fit, one `sweep hit` line per read that named a side, and
 * `sweep end` with the vote.
 */
export async function sweep (ctx: Context, actuators: Actuators, sensors: Sensors, communication: Communication, { referee, range = 'long', span = 180, step = 15, reads = 3 }: SweepOptions): Promise<SweepResult> {

  const t0 = ctx.now();
  const { ladder, reason: negotiated } = await negotiateLadder(ctx, sensors, referee, range);

  const levels     = ladder.channels.map(() => 0);
  const heardRound = ladder.channels.map(() => 0);
  const beat = await trackBeat(sensors, ladder.channels, function countFrame (channel: number): void {
    const k = ladder.channels.indexOf(channel);
    heardRound[k] = (heardRound[k] ?? 0) + 1;
    levels[k] = (levels[k] ?? 0) + 1;
  });

  await communication.state('infrared', range === 'short' ? 'tracking-short' : 'tracking');
  await actuators.motor.stabilize(StabilizationIndex.full);
  ctx.log('info', `sweep start ${JSON.stringify({ ladder: ladder.strengths, range, negotiated, span, step, reads, roundMs: ladder.roundMs, turnMs, firstMs, msBefore, stepMs, half, heardMin, silentMin, endRounds, agree })}`);

  
  const { axis, used } = await sweepForAxis(ctx, actuators, sensors, ladder, heardRound, span, step);
  const { heading, hits } = axis === null ? { heading: null, hits: 0 } : await sweepForDirection(ctx, actuators, sensors, ladder, beat, axis, reads);

  if (heading !== null) await turnTo(ctx, actuators, sensors, heading, firstMs);
  
  await actuators.motor.stop();
  await actuators.motor.stabilize(StabilizationIndex.none);
  await communication.state('infrared', null);
  await beat.release();

  const aborted = ctx.motion.aborted;
  
  return {
    reason: aborted ? 'aborted' : heading === null ? 'nothing' : 'direction',
    range, negotiated,
    heading: aborted ? null : heading,
    used: used.map(k => ladder.strengths[k] ?? 0),
    levels, hits,
    seconds: Math.round((ctx.now() - t0) / 100) / 10,
  };
  
}

/**
 * Step 1: the line the sender is on. Turns to each heading of the span,
 * listens one ladder round there and fits the lobes to what was heard;
 * `heardRound` is the frame counter the beat tracker fills. Logs one `sweep`
 * line per heading and `sweep axis` with the fit. Returns the axis, null
 * when no level was heard at some headings and silent at others, and the
 * levels the fit used as indexes into the ladder.
 */
async function sweepForAxis (ctx: Context, actuators: Actuators, sensors: Sensors, ladder: Ladder, heardRound: number[], span: number, step: number): Promise<{ axis: number | null; used: number[] }> {
  
  const start = await turnTo(ctx, actuators, sensors, null, turnMs);
  const count = span >= 360 ? Math.round(360 / step) : Math.floor(span / step) + 1;
  const first = span >= 360 ? start : start - span / 2;
  const positions: Position[] = [];
  
  for (let n = 0; n < count && !ctx.motion.aborted; n++) {
    const target  = mod360(first + n * step);
    const heading = await turnTo(ctx, actuators, sensors, target, n === 0 ? firstMs : turnMs);
    const frames  = await listenOneRound(ctx, heardRound, ladder.roundMs);
    positions.push({ target, heading, frames });
    ctx.log('info', `sweep ${JSON.stringify({ n, target: Math.round(target), heading: Math.round(heading), frames })}`);
  }
  
  if (ctx.motion.aborted) return { axis: null, used: [] };
  
  return fitAxis(ctx, ladder, positions);

}

/**
 * Step 2: which end of the axis. Faces the axis, so the sender is inside
 * the lobe at either end and its frames arrive, and reads the receivers
 * into every frame the beat expects. A read that lands names the corners
 * that heard: the front ones put the sender ahead, the back ones behind.
 * `agree` reads on one side decide; `endRounds` ladder rounds without that
 * give null. Logs `sweep hit` per read that named a side and `sweep end`
 * with the vote. Returns the heading and the reads that named a side.
 */
async function sweepForDirection (ctx: Context, actuators: Actuators, sensors: Sensors, ladder: Ladder, beat: Beat, axis: number, reads: number): Promise<{ heading: number | null; hits: number }> {
  
  const facing = await turnTo(ctx, actuators, sensors, axis, firstMs);
  const t0 = performance.now();
  let front = 0, back = 0, volleys = 0;
  
  while (performance.now() - t0 < endRounds * ladder.roundMs && !ctx.motion.aborted && front < agree && back < agree) {
    const receivers = await readAtNextFrame(ctx, beat, ladder, reads);
    if (receivers === null) continue;
    volleys++;
    const side = sideOfHit(receivers);
    if (side === null) continue;
    if (side === 'front') front++; else back++;
    ctx.log('info', `sweep hit ${JSON.stringify({ receivers: receivers.map(i => names[i]).join('+'), side, front, back })}`);
  }
  
  const heading = ctx.motion.aborted ? null : front >= agree ? axis : back >= agree ? mod360(axis + 180) : null;
  
  ctx.log('info', `sweep end ${JSON.stringify({ axis, facing: Math.round(facing), volleys, front, back, heading, seconds: Math.round((performance.now() - t0) / 100) / 10 })}`);
  
  return { heading, hits: front + back };

}

/**
 * Turn to `target`, or stay when null, and give it `ms`; the motion stream
 * is held that long so the heading at the end is read, not assumed. The
 * firmware turns on a roll at speed 0 to the heading.
 */
async function turnTo (ctx: Context, actuators: Actuators, sensors: Sensors, target: number | null, ms: number): Promise<number> {
  const release = await sensors.motion.subscribe(null);
  if (target !== null) await actuators.motor.roll(0, target);
  await wait(ms);
  const heading = mod360(-(ctx.status.angles?.yaw ?? 0));
  await release();
  return heading;
}

/** Stand for one ladder round and return the frames heard per level, from the counter the beat tracker fills. */
async function listenOneRound (ctx: Context, heardRound: number[], roundMs: number): Promise<number[]> {
  heardRound.fill(0);
  const t0 = performance.now();
  while (performance.now() - t0 < roundMs && !ctx.motion.aborted) await wait(50);
  return [...heardRound];
}

/**
 * The fit of two lobes, `half` degrees each side of a candidate and of its
 * opposite, to the heard and silent headings, summed over every level heard
 * at `heardMin` headings or more and silent at `silentMin` or more; a level
 * heard everywhere or nowhere says nothing. A frame outside the lobes counts
 * twice as much against a candidate as a silence inside, which dropped
 * frames give at every level: frames decide, a single silence never. An
 * axis is a line, so the candidates run to 180, and the ones that score
 * alike are averaged on a 180 degree circle, which makes the axis finer
 * than the step between headings. Logs `sweep axis`.
 */
function fitAxis (ctx: Context, ladder: Ladder, positions: Position[]): { axis: number | null; used: number[] } {
  
  const heardAt = ladder.channels.map((_, k) => positions.filter(p => (p.frames[k] ?? 0) > 0).length);
  const used = ladder.channels.map((_, k) => k).filter(k => (heardAt[k] ?? 0) >= heardMin && positions.length - (heardAt[k] ?? 0) >= silentMin);
  let axis: number | null = null, fit = 0;
  
  if (used.length) {
  
    const best: number[] = [];
    fit = -Infinity;
  
    for (let d = 0; d < 180; d++) {
      const score = scoreAxis(d, positions, used);
      if (score > fit + 1e-9) {
        fit = score;
        best.length = 0;
      }
      if (score >= fit - 1e-9) best.push(d);
    }
  
    let sx = 0, sy = 0;
  
    for (const d of best) {
      sx += Math.cos(d * Math.PI / 90);
      sy += Math.sin(d * Math.PI / 90);
    }
    axis = Math.round(mod360(Math.atan2(sy, sx) * 90 / Math.PI) * 10) / 10;
  }
  
  ctx.log('info', `sweep axis ${JSON.stringify({ heardAt, used: used.map(k => ladder.strengths[k]), fit, axis })}`);
  
  return { axis, used };

}

/** How well the lobes of candidate axis `d` match the frames and silences at the positions, over the levels `used`. */
function scoreAxis (d: number, positions: Position[], used: number[]): number {
  let score = 0;
  for (const p of positions) {
    const off = Math.abs(angleDistance(d, p.heading));
    const inside = off <= half || off >= 180 - half;
    for (const k of used) score += (p.frames[k] ?? 0) > 0 ? (inside ? 1 : -2) : (inside ? -0.5 : 1);
  }
  return score;
}

/**
 * One volley of `reads` into the next frame the beat expects, and the
 * receivers that heard a channel of the ladder in the first read that
 * landed; null when none landed, or the beat is not learned yet, in which
 * case it waits a moment.
 */
async function readAtNextFrame (ctx: Context, beat: Beat, ladder: Ladder, reads: number): Promise<number[] | null> {

  const lead = msBefore + stepMs * (reads - 1) / 2;
  const at = beat.next(performance.now() + lead + 12);
  
  if (at === null) {
    await wait(50);
    return null;
  }
  
  const payloads = await readVolley(ctx, at - lead, reads, stepMs);
  
  for (const payload of payloads) {
    if (payload === null) continue;
    const receivers = corners.map((_, i) => i).filter(i => ladder.channels.includes(payload[i] ?? -1));
    if (receivers.length) return receivers;
  }

  return null;

}

/** The side the corners that heard put the sender on: front, back, or null for opposite corners or all four, which name no side. */
function sideOfHit (receivers: number[]): 'front' | 'back' | null {
  let sx = 0, sy = 0;
  for (const i of receivers) {
    sx += Math.cos((corners[i] ?? 0) * Math.PI / 180);
    sy += Math.sin((corners[i] ?? 0) * Math.PI / 180);
  }
  if (Math.hypot(sx, sy) < 0.5) return null;
  return Math.abs(Math.atan2(sy, sx) * 180 / Math.PI) < 90 ? 'front' : 'back';
}
