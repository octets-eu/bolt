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
  /** Reads of the receivers per volley into a frame. */
  reads?: number | undefined;
  /** The heading the sender was last found at, from a spot on the way here; folded in with the weight of one read, it breaks the nose-or-tail tie when no read lands. */
  prior?: number | undefined;
}

export interface SweepResult {
  /**
   * direction: the belief settled on a bearing. nothing: it did not within
   * `maxRounds` standing rounds, the sender is out of reach, on top, or the
   * reads never named a side.
   */
  reason: 'direction' | 'nothing' | 'aborted';
  /** The ladder swept on, and whether a frame of it confirmed the switch before the sweep. */
  range: LadderRange;
  negotiated: NegotiateResult['reason'];
  /** The direction found, a heading; null for nothing and aborted. */
  heading: number | null;
  /** Levels believed to carry, the ones with a lobe at this distance, as strengths, weakest first. */
  used: number[];
  /** Frames heard per ladder level during the sweep. */
  levels: number[];
  /** Reads that landed and named a side. */
  hits: number;
  /** Reads that landed with all four corners hearing one level: the sender is on top. */
  flooded: number;
  seconds: number;
}

/**
 * What the sweep believes, as log likelihoods over the sender's bearing, a
 * heading in 1 degree bins. Per ladder level a bin holds one number per
 * state of that level at this distance, see `STATES`. `hits` is what the
 * corner reads said, which is the same for every level.
 */
interface Belief {
  readonly levels: readonly Float64Array[];
  readonly hits: Float64Array;
}

/** Where the belief stands after a round: the likeliest bearing and the share of the belief within `exitWindow` of it. */
interface Summary {
  mode: number;
  mass: number;
}

const BINS = 360;
/** Half-widths a lobe may have, degrees: at 46 cm the weakest level reached 75, at 62 cm 45; measured 2026-10-19. */
const widths: readonly number[] = [45, 60, 75];
/** The states of a level at this distance: 0 not arriving, 1 to `widths.length` a carrier with a lobe of that half-width, `ALL` heard all round. */
const STATES = widths.length + 2;
const NONE = 0;
const ALL = STATES - 1;
const pIn    = 0.75;     // a carrier frame heard in one round, sender inside the lobe; the standing rounds of the walks of 2026-10-18
const pOut   = 0.2;      // the same with the sender abeam
const pNone  = 0.05;     // a frame of a level that does not arrive here
const pAll   = 0.9;      // a frame of a level heard all round
const pHitIn = 0.9;      // a read's corners hold the sender within 90 degrees of their mean
const edge   = 15;       // a lobe's edge is soft: hearing slides from inside to outside over its half-width plus or minus this
const exitWindow = 20;   // degrees either side of the mode that must hold `massMin` of the belief
const massMin    = 0.9;
const maxRounds  = 16;   // standing rounds before the sweep gives up; chosen
const farRounds  = 32;   // the same while the ladder's strongest level is the one likely carrier: far out a read lands once in ten rounds; chosen
const restMs     = 2500; // the most a turn gets to come to rest
const candidates = 24;   // headings considered for the next round, 15 degrees apart
const msBefore   = 45;   // a volley's centre before the expected notify; infrared-timing run 5
const stepMs     = 6;    // between the reads of a volley; infrared-timing run 5
/** Where the receivers sit, degrees off the nose: front left, front right, back right, back left. */
const corners: readonly number[] = [-45, 45, 135, -135];

/**
 * Where another Bolt is, from a belief. The other Bolt sends a ladder
 * (Communication.sendLadder), negotiated first with the referee
 * (negotiate-ladder.ts) so it holds for the sweep. This one listens where
 * it stands for one ladder round, reads its corners into the frames, and
 * folds every frame, every silent round and every read into a posterior
 * over the sender's bearing; then it turns to the heading whose round is
 * expected to narrow the posterior most, and listens again. It ends when
 * `massMin` of the belief lies within `exitWindow` degrees of the mode,
 * facing that heading, or after `maxRounds` rounds with nothing,
 * `farRounds` while the ladder's strongest level is the one likely carrier.
 *
 * - A frame is heard with the sender inside the lobe of its level and lost
 *   abeam, the lobe's edge soft over a band of `edge` degrees either side
 *   of its half-width; a stronger level is heard all round, a weaker one
 *   not at all. Which is which at this distance, and how wide the lobe is,
 *   the belief does not know, so each level carries a state per width in
 *   `widths` besides not arriving and heard all round, and the one the data
 *   favours wins; the carriers are the levels most likely in a lobe state.
 * - A frame counts wherever the nose is at the moment it arrives, the yaw
 *   is read from the motion stream held for the whole sweep; a silence is
 *   one standing round without a frame of the level.
 * - The notifies cannot tell ahead from behind, so without a read the
 *   belief has two humps 180 degrees apart. A read that lands names the
 *   corners that heard (beat.ts); the sender is within 90 degrees of their
 *   mean. A `prior`, the direction the last sweep found, counts as one such
 *   read: the frames still find the axis, the prior only picks its end
 *   until real reads outweigh it.
 *
 * Motor commands only, its own loop. Shows 'tracking' while it runs. Ends
 * pointing at the direction found, or where the last round stood when there
 * is none, stabilization off. Ends on fullstop. Records `sweep start` with
 * the constants, one `sweep round` line per standing round with the
 * belief's mode, its mass in the window, the carrier probabilities and the
 * likeliest lobe width per level, and `sweep end`.
 */
export async function sweep (ctx: Context, actuators: Actuators, sensors: Sensors, communication: Communication, { referee, range = 'long', reads = 5, prior }: SweepOptions): Promise<SweepResult> {

  const t0 = ctx.now();
  const s = ctx.motion;
  const { ladder, reason: negotiated } = await negotiateLadder(ctx, sensors, referee, range);
  const belief = emptyBelief(ladder.channels.length);
  if (prior !== undefined) observeHit(belief, prior);
  const levels: number[] = ladder.channels.map(zero);
  const heardThisRound: boolean[] = ladder.channels.map(no);
  const counts = { hits: 0, flooded: 0 };

  const release = await sensors.motion.subscribe(null);
  const beat = await trackBeat(sensors, ladder.channels, function countFrame (channel: number): void {
    const k = ladder.channels.indexOf(channel);
    levels[k] = (levels[k] ?? 0) + 1;
    heardThisRound[k] = true;
    observeFrame(belief, k, headingNow(ctx));
  });
  await communication.state('infrared', range === 'short' ? 'tracking-short' : 'tracking');
  await actuators.motor.stabilize(StabilizationIndex.full);
  ctx.log('info', `sweep start ${JSON.stringify({ ladder: ladder.strengths, range, negotiated, reads, prior: prior ?? null, roundMs: ladder.roundMs, pIn, pOut, pNone, pAll, pHitIn, widths, edge, exitWindow, massMin, maxRounds, farRounds, restMs, candidates, msBefore, stepMs })}`);

  let heading: number | null = null;
  let rounds = 0;
  let next: number | null = null;
  let limit = maxRounds;

  while (rounds < limit && heading === null && !s.aborted) {

    const stood = await turnAndRest(ctx, s, actuators, next);
    heardThisRound.fill(false);
    const framesBefore = [...levels];
    await listenAndRead(ctx, s, beat, ladder, reads, belief, counts);
    observeSilences(belief, heardThisRound, stood);
    rounds++;
    const p = posterior(belief);
    const { mode, mass } = summarize(p);
    const carrier = carrierProbabilities(belief, p);
    limit = onlyTheStrongest(carrier) ? farRounds : maxRounds;
    if (mass >= massMin) heading = mode;
    else next = nextHeading(belief, p);
    ctx.log('info', `sweep round ${JSON.stringify({
      n: rounds, heading: Math.round(stood), frames: framesSince(levels, framesBefore), hits: counts.hits, flooded: counts.flooded,
      mode, mass: Math.round(mass * 100) / 100,
      carrier: byStrength(ladder, carrier.map(hundredths)), limit,
      width: byStrength(ladder, lobeWidths(belief, p)),
      next,
    })}`);
  }

  if (heading !== null) await turnAndRest(ctx, s, actuators, heading);
  
  await actuators.motor.stop();
  await actuators.motor.stabilize(StabilizationIndex.none);
  await communication.state('infrared', null);
  await beat.release();
  await release();

  const aborted = s.aborted;
  const carrier = carrierProbabilities(belief, posterior(belief));
  const reason: SweepResult['reason'] = aborted ? 'aborted' : heading === null ? 'nothing' : 'direction';
  const seconds = Math.round((ctx.now() - t0) / 100) / 10;

  ctx.log('info', `sweep end ${JSON.stringify({ reason, heading, rounds, hits: counts.hits, flooded: counts.flooded, seconds })}`);
  
  return {
    reason, range, negotiated,
    heading: aborted ? null : heading,
    used: ladder.strengths.filter(function carries (_strength: number, k: number): boolean { return (carrier[k] ?? 0) > 0.5; }),
    levels, hits: counts.hits, flooded: counts.flooded, seconds,
  };

}

function zero (): number { return 0; }

/** Whether the ladder's strongest level is the one carrier the belief holds likely: far out, where the weaker ones do not arrive. */
function onlyTheStrongest (carrier: readonly number[]): boolean {
  const last = carrier.length - 1;
  for (let k = 0; k < last; k++) if ((carrier[k] ?? 0) > 0.5) return false;
  return (carrier[last] ?? 0) > 0.5;
}
function no (): boolean { return false; }
function hundredths (v: number): number { return Math.round(v * 100) / 100; }

/** The frames per level since `before`. */
function framesSince (levels: readonly number[], before: readonly number[]): number[] {
  return levels.map(function since (v: number, k: number): number { return v - (before[k] ?? 0); });
}

/** One value per ladder level, keyed by the level's strength, for a log line. */
function byStrength (ladder: Ladder, values: readonly number[]): { [strength: number]: number } {
  const out: { [strength: number]: number } = {};
  ladder.strengths.forEach(function key (strength: number, k: number): void { out[strength] = values[k] ?? 0; });
  return out;
}

/** A belief that knows nothing: every bin and state at log likelihood 0. */
function emptyBelief (levelCount: number): Belief {
  const levels: Float64Array[] = [];
  for (let k = 0; k < levelCount; k++) levels.push(new Float64Array(BINS * STATES));
  return { levels, hits: new Float64Array(BINS) };
}

/** The heading the nose points at now, from the yaw of the motion stream. */
function headingNow (ctx: Context): number {
  return mod360(-(ctx.status.angles?.yaw ?? 0));
}

/** How far a sender at `bearing` is off the nose or tail of a Bolt whose nose points at `heading`, 0 to 90 degrees. */
function offAxis (bearing: number, heading: number): number {
  const off = Math.abs(angleDistance(bearing, heading));
  return Math.min(off, 180 - off);
}

/** How far a sender `off` the axis is inside a lobe of half-width `half`: 1 within `half` less `edge`, 0 beyond `half` plus `edge`, sliding between. */
function insideLobe (off: number, half: number): number {
  return Math.min(1, Math.max(0, (half + edge - off) / (2 * edge)));
}

/** The half-width of the lobe of a lobe state. */
function halfWidth (state: number): number {
  const half = widths[state - 1];
  if (half === undefined) throw new Error(`sweep: state ${state} has no lobe`);
  return half;
}

/** The probability of hearing a frame of a level in one round, by the level's state and how far the sender is off the axis. */
function hearingProbability (state: number, off: number): number {
  if (state === NONE) return pNone;
  if (state === ALL) return pAll;
  return pOut + (pIn - pOut) * insideLobe(off, halfWidth(state));
}

/** A frame of level `k` arrived with the nose at `heading`: every bin and state takes the log of hearing it there. */
function observeFrame (belief: Belief, k: number, heading: number): void {
  const L = belief.levels[k];
  if (!L) return;
  for (let b = 0; b < BINS; b++) {
    const off = offAxis(b, heading);
    for (let s = 0; s < STATES; s++) L[b * STATES + s] = (L[b * STATES + s] ?? 0) + Math.log(hearingProbability(s, off));
  }
}

/** A standing round at `heading` passed without a frame of level `k`: every bin and state takes the log of not hearing it there. */
function observeSilence (belief: Belief, k: number, heading: number): void {
  const L = belief.levels[k];
  if (!L) return;
  for (let b = 0; b < BINS; b++) {
    const off = offAxis(b, heading);
    for (let s = 0; s < STATES; s++) L[b * STATES + s] = (L[b * STATES + s] ?? 0) + Math.log(1 - hearingProbability(s, off));
  }
}

/** The silences of one standing round at `heading`: every level not heard in it. */
function observeSilences (belief: Belief, heardThisRound: readonly boolean[], heading: number): void {
  for (let k = 0; k < heardThisRound.length; k++) if (!heardThisRound[k]) observeSilence(belief, k, heading);
}

/** A read landed: the corners that heard put the sender within 90 degrees of `bearing`. */
function observeHit (belief: Belief, bearing: number): void {
  for (let b = 0; b < BINS; b++) belief.hits[b] = (belief.hits[b] ?? 0) + Math.log(Math.abs(angleDistance(b, bearing)) < 90 ? pHitIn : 1 - pHitIn);
}

/** The largest log likelihood among the states at bin `b` of a level. */
function maxState (L: Float64Array, b: number): number {
  let m = -Infinity;
  for (let s = 0; s < STATES; s++) m = Math.max(m, L[b * STATES + s] ?? 0);
  return m;
}

/** The log likelihood of bin `b` of a level, the states summed with equal prior. */
function levelLogLikelihood (L: Float64Array, b: number): number {
  const m = maxState(L, b);
  let sum = 0;
  for (let s = 0; s < STATES; s++) sum += Math.exp((L[b * STATES + s] ?? 0) - m);
  return m + Math.log(sum / STATES);
}

/** The share of state `s` among all at bin `b` of a level. */
function stateShare (L: Float64Array, b: number, s: number): number {
  const m = maxState(L, b);
  let sum = 0;
  for (let t = 0; t < STATES; t++) sum += Math.exp((L[b * STATES + t] ?? 0) - m);
  return Math.exp((L[b * STATES + s] ?? 0) - m) / sum;
}

/** The posterior over the bearing, normalised to sum 1. */
function posterior (belief: Belief): Float64Array {
  const p = new Float64Array(BINS);
  let m = -Infinity;
  for (let b = 0; b < BINS; b++) {
    let v = belief.hits[b] ?? 0;
    for (const L of belief.levels) v += levelLogLikelihood(L, b);
    p[b] = v;
    m = Math.max(m, v);
  }
  let sum = 0;
  for (let b = 0; b < BINS; b++) {
    p[b] = Math.exp((p[b] ?? 0) - m);
    sum += p[b] ?? 0;
  }
  for (let b = 0; b < BINS; b++) p[b] = (p[b] ?? 0) / sum;
  return p;
}

/** The bin with the most belief, and the belief within `exitWindow` degrees of it. */
function summarize (p: Float64Array): Summary {
  let mode = 0;
  for (let b = 1; b < BINS; b++) if ((p[b] ?? 0) > (p[mode] ?? 0)) mode = b;
  let mass = 0;
  for (let b = 0; b < BINS; b++) if (Math.abs(angleDistance(b, mode)) <= exitWindow) mass += p[b] ?? 0;
  return { mode, mass };
}

/** The share of the lobe states at bin `b` of a level, per width. */
function lobeShares (L: Float64Array, b: number): number[] {
  const shares: number[] = [];
  for (let s = 1; s < ALL; s++) shares.push(stateShare(L, b, s));
  return shares;
}

/** How likely each level is a carrier, one with a lobe: the lobe states' share of all, weighted by the posterior over the bearing. */
function carrierProbabilities (belief: Belief, p: Float64Array): number[] {
  return belief.levels.map(function lobeShare (L: Float64Array): number {
    let total = 0;
    for (let b = 0; b < BINS; b++) for (const share of lobeShares(L, b)) total += (p[b] ?? 0) * share;
    return total;
  });
}

/** The likeliest half-width of each level's lobe, given it has one, weighted by the posterior over the bearing. */
function lobeWidths (belief: Belief, p: Float64Array): number[] {
  return belief.levels.map(function width (L: Float64Array): number {
    const total: number[] = widths.map(zero);
    for (let b = 0; b < BINS; b++) lobeShares(L, b).forEach(function add (share: number, w: number): void { total[w] = (total[w] ?? 0) + (p[b] ?? 0) * share; });
    return widths[total.indexOf(Math.max(...total))] ?? 0;
  });
}

/** The heading whose standing round is expected to tell the most about the bearing, among `candidates` headings round the circle. */
function nextHeading (belief: Belief, p: Float64Array): number {
  let best = 0, bestGain = -Infinity;
  for (let c = 0; c < candidates; c++) {
    const heading = c * 360 / candidates;
    const gain = expectedGain(belief, p, heading);
    if (gain > bestGain) {
      bestGain = gain;
      best = heading;
    }
  }
  return best;
}

/** The information a round at `heading` is expected to give about the bearing, summed over the levels. */
function expectedGain (belief: Belief, p: Float64Array, heading: number): number {
  let gain = 0;
  for (const L of belief.levels) gain += levelGain(L, p, heading);
  return gain;
}

/**
 * The mutual information between hearing level `L` in a round at `heading`
 * and the bearing: the entropy of the predicted outcome less the expected
 * entropy of the outcome once the bearing is known, the level's state
 * marginalised.
 */
function levelGain (L: Float64Array, p: Float64Array, heading: number): number {
  let predicted = 0, conditional = 0;
  for (let b = 0; b < BINS; b++) {
    const off = offAxis(b, heading);
    let q = 0;
    for (let s = 0; s < STATES; s++) q += stateShare(L, b, s) * hearingProbability(s, off);
    predicted += (p[b] ?? 0) * q;
    conditional += (p[b] ?? 0) * binaryEntropy(q);
  }
  return binaryEntropy(predicted) - conditional;
}

/** The entropy of a yes or no with probability `q`, in bits. */
function binaryEntropy (q: number): number {
  if (q <= 0 || q >= 1) return 0;
  return -(q * Math.log2(q) + (1 - q) * Math.log2(1 - q));
}

/**
 * Turn to `target`, or stay when null, and rest: the round starts when the
 * ball neither moves nor turns, read from the motion stream, or after
 * `restMs`. The firmware turns on a roll at speed 0 to the heading.
 * Returns the heading at rest.
 */
async function turnAndRest (ctx: Context, s: AbortSignal, actuators: Actuators, target: number | null): Promise<number> {
  if (target !== null) await actuators.motor.roll(0, target);
  const t0 = performance.now();
  await wait(200);
  while (performance.now() - t0 < restMs && !s.aborted && !isStill(ctx)) await wait(50);
  return headingNow(ctx);
}

/** `status.isStill` without the throw: false while no fresh motion sample has come. */
function isStill (ctx: Context): boolean {
  try { return ctx.status.isStill; }
  catch { return false; }
}

/**
 * One standing round: reads the corners into every frame the beat expects
 * until the ladder round is over, and folds each read that landed into the
 * belief. The frames themselves arrive through the beat tracker. Counts
 * the reads that landed and named a side as hits, and the reads with all
 * four corners on one level as flooded.
 */
async function listenAndRead (ctx: Context, s: AbortSignal, beat: Beat, ladder: Ladder, reads: number, belief: Belief, counts: { hits: number; flooded: number }): Promise<void> {
  const t0 = performance.now();
  while (performance.now() - t0 < ladder.roundMs && !s.aborted) {
    const payload = await readAtNextFrame(ctx, beat, ladder, reads);
    if (payload === null) continue;
    if (payload.every(function same (channel: number): boolean { return channel === payload[0]; })) counts.flooded++;
    const receivers: number[] = [];
    for (let i = 0; i < corners.length; i++) if (ladder.channels.includes(payload[i] ?? -1)) receivers.push(i);
    const bearing = hitBearing(receivers, headingNow(ctx));
    if (bearing === null) continue;
    observeHit(belief, bearing);
    counts.hits++;
  }
}

/**
 * One volley of `reads` into the next frame the beat expects, and the
 * first read that landed, the channel each corner heard; null when none
 * landed, or the beat is not learned yet, in which case it waits a moment.
 */
async function readAtNextFrame (ctx: Context, beat: Beat, ladder: Ladder, reads: number): Promise<readonly number[] | null> {
  const lead = msBefore + stepMs * (reads - 1) / 2;
  const at = beat.next(performance.now() + lead + 12);
  if (at === null) {
    await wait(50);
    return null;
  }
  const payloads = await readVolley(ctx, at - lead, reads, stepMs);
  for (const payload of payloads) {
    if (payload === null) continue;
    if (payload.some(function heard (channel: number): boolean { return ladder.channels.includes(channel); })) return payload;
  }
  return null;
}

/** Where the corners that heard put the sender: the heading plus their mean angle; null for opposite corners or all four, which name no side. */
function hitBearing (receivers: readonly number[], heading: number): number | null {
  let sx = 0, sy = 0;
  for (const i of receivers) {
    sx += Math.cos((corners[i] ?? 0) * Math.PI / 180);
    sy += Math.sin((corners[i] ?? 0) * Math.PI / 180);
  }
  if (Math.hypot(sx, sy) < 0.5) return null;
  return mod360(heading + Math.atan2(sy, sx) * 180 / Math.PI);
}
