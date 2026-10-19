import type { Actuators } from '../actuators/actuators';
import type { Communication } from '../communication/communication';
import type { Ladder } from '../communication/communication';
import type { Context } from '../context';
import type { Sensors } from '../sensors/sensors';
import { angleDistance, mod360 } from '../helpers/math';
import { StabilizationIndex } from '../protocol/constants';
import { wait } from '../helpers/utils';
import { negotiateLadder } from '../behavior/negotiate-ladder';
import { trackBeat } from '../behavior/beat';
import type { Beat } from '../behavior/beat';
import { corners, readAtNextFrame } from '../behavior/sweep';
import type { SweepOptions, SweepResult } from '../behavior/sweep';

/**
 * What the sweep believes, as log likelihoods over the sender's bearing, a
 * heading in 1 degree bins. Per ladder level a bin holds three numbers, one
 * per state of that level at this distance: not arriving, a carrier with a
 * lobe, heard all round. `hits` is what the corner reads said, which is the
 * same for every level.
 */
interface Belief {
  levels: Float64Array[];
  hits:   Float64Array;
}

const BINS   = 360;
const STATES = 3;        // of a level: 0 not arriving, 1 the carrier with a lobe, 2 heard all round
const pIn    = 0.75;     // a carrier frame heard in one round, sender inside the lobe; the standing rounds of the walks
const pOut   = 0.2;      // the same with the sender abeam
const pNone  = 0.05;     // a frame of a level that does not arrive here
const pAll   = 0.9;      // a frame of a level heard all round
const pHitIn = 0.9;      // a read's corners hold the sender within 90 degrees of their mean
const half   = 60;       // half-width of a lobe, degrees
const edge   = 15;       // the lobe's edge is soft: hearing slides from inside to outside over `half` plus or minus this
const window = 20;       // degrees either side of the mode that must hold `massMin` of the belief
const massMin   = 0.9;
const maxRounds = 16;    // standing rounds before the sweep gives up; chosen
const restMs    = 2500;  // the most a turn gets to come to rest
const candidates = 24;   // headings considered for the next round, 15 degrees apart

/**
 * Where another Bolt is, from a belief instead of a scan. The other Bolt
 * sends a ladder, negotiated first with the referee. This one listens where
 * it stands for one ladder round, reads its corners into the frames, and
 * folds every frame, every silent round and every read into a posterior
 * over the sender's bearing; then it turns to the heading whose round is
 * expected to narrow the posterior most, and listens again. It ends when
 * `massMin` of the belief lies within `window` degrees of the mode, facing
 * that heading, or after `maxRounds` rounds with nothing.
 *
 * - A frame is heard with the sender inside the lobe of its level and lost
 *   abeam, the lobe's edge soft over a band of `edge` degrees either side
 *   of `half`; a stronger level is heard all round, a weaker one not at all.
 *   Which is which at this distance the belief does not know, so each level
 *   carries three states and the one the data favours wins; the carrier is
 *   the level most likely in the lobe state.
 * - A frame counts wherever the nose is at the moment it arrives, the yaw
 *   is read from the motion stream held for the whole sweep; a silence is
 *   one standing round without a frame of the level.
 * - The notifies cannot tell ahead from behind, so without a read the
 *   belief has two humps 180 degrees apart. A read that lands names the
 *   corners that heard; the sender is within 90 degrees of their mean.
 *
 * Same options and result as behavior/sweep.ts, so sweepTest judges both.
 * Logs `cleverSweep start` with the constants, one `cleverSweep round` line
 * per standing round with the belief's mode, its mass in the window and
 * the carrier probabilities, and `cleverSweep end`.
 */
export async function cleverSweep (ctx: Context, actuators: Actuators, sensors: Sensors, communication: Communication, { referee, range = 'long', reads = 5 }: SweepOptions): Promise<SweepResult> {

  const t0 = ctx.now();
  const { ladder, reason: negotiated } = await negotiateLadder(ctx, sensors, referee, range);
  const belief = emptyBelief(ladder.channels.length);
  const levels = ladder.channels.map(() => 0);
  const heardThisRound = ladder.channels.map(() => false);
  let hits = 0;

  const release = await sensors.motion.subscribe(null);
  const beat = await trackBeat(sensors, ladder.channels, function countFrame (channel: number): void {
    const k = ladder.channels.indexOf(channel);
    levels[k] = (levels[k] ?? 0) + 1;
    heardThisRound[k] = true;
    observeFrame(belief, k, headingNow(ctx));
  });
  await communication.state('infrared', range === 'short' ? 'tracking-short' : 'tracking');
  await actuators.motor.stabilize(StabilizationIndex.full);
  ctx.log('info', `cleverSweep start ${JSON.stringify({ ladder: ladder.strengths, range, negotiated, reads, roundMs: ladder.roundMs, pIn, pOut, pNone, pAll, pHitIn, half, edge, window, massMin, maxRounds, restMs })}`);

  let heading: number | null = null;
  let rounds = 0;
  let next: number | null = null;
  while (rounds < maxRounds && heading === null && !ctx.motion.aborted) {
    const stood = await turnAndRest(ctx, actuators, next);
    heardThisRound.fill(false);
    const framesBefore = [...levels];
    hits += await listenAndRead(ctx, beat, ladder, reads, belief);
    observeSilences(belief, heardThisRound, stood);
    rounds++;
    const p = posterior(belief);
    const { mode, mass } = summarize(p);
    const carrier = carrierProbabilities(belief, p);
    if (mass >= massMin) heading = mode;
    else next = nextHeading(belief, p);
    ctx.log('info', `cleverSweep round ${JSON.stringify({
      n: rounds, heading: Math.round(stood), frames: levels.map((v, k) => v - (framesBefore[k] ?? 0)), hits,
      mode, mass: Math.round(mass * 100) / 100, carrier: Object.fromEntries(ladder.strengths.map((s, k) => [s, Math.round((carrier[k] ?? 0) * 100) / 100])), next,
    })}`);
  }

  if (heading !== null) await turnAndRest(ctx, actuators, heading);
  await actuators.motor.stop();
  await actuators.motor.stabilize(StabilizationIndex.none);
  await communication.state('infrared', null);
  await beat.release();
  await release();

  const aborted = ctx.motion.aborted;
  const p = posterior(belief);
  const carrier = carrierProbabilities(belief, p);
  const reason: SweepResult['reason'] = aborted ? 'aborted' : heading === null ? 'nothing' : 'direction';
  ctx.log('info', `cleverSweep end ${JSON.stringify({ reason, heading, rounds, hits, seconds: Math.round((ctx.now() - t0) / 100) / 10 })}`);
  return {
    reason, range, negotiated,
    heading: aborted ? null : heading,
    used: ladder.strengths.filter((_, k) => (carrier[k] ?? 0) > 0.5),
    levels, hits,
    seconds: Math.round((ctx.now() - t0) / 100) / 10,
  };
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

/**
 * How far a sender at `bearing` is inside the lobe of a Bolt whose nose
 * points at `heading`: 1 within `half` less `edge` degrees of nose or tail,
 * 0 beyond `half` plus `edge`, sliding between.
 */
function insideLobe (bearing: number, heading: number): number {
  const off = Math.abs(angleDistance(bearing, heading));
  const nearest = Math.min(off, 180 - off);
  return Math.min(1, Math.max(0, (half + edge - nearest) / (2 * edge)));
}

/** The probability of hearing a frame of a level in one round, by the level's state and how far the sender is inside the lobe. */
function hearingProbability (state: number, inside: number): number {
  if (state === 0) return pNone;
  if (state === 2) return pAll;
  return pOut + (pIn - pOut) * inside;
}

/** A frame of level `k` arrived with the nose at `heading`: every bin and state takes the log of hearing it there. */
function observeFrame (belief: Belief, k: number, heading: number): void {
  const L = belief.levels[k];
  if (!L) return;
  for (let b = 0; b < BINS; b++) {
    const inside = insideLobe(b, heading);
    for (let s = 0; s < STATES; s++) L[b * STATES + s] = (L[b * STATES + s] ?? 0) + Math.log(hearingProbability(s, inside));
  }
}

/** A standing round at `heading` passed without a frame of level `k`: every bin and state takes the log of not hearing it there. */
function observeSilence (belief: Belief, k: number, heading: number): void {
  const L = belief.levels[k];
  if (!L) return;
  for (let b = 0; b < BINS; b++) {
    const inside = insideLobe(b, heading);
    for (let s = 0; s < STATES; s++) L[b * STATES + s] = (L[b * STATES + s] ?? 0) + Math.log(1 - hearingProbability(s, inside));
  }
}

/** The silences of one standing round at `heading`: every level not heard in it. */
function observeSilences (belief: Belief, heardThisRound: boolean[], heading: number): void {
  for (let k = 0; k < heardThisRound.length; k++) if (!heardThisRound[k]) observeSilence(belief, k, heading);
}

/** A read landed: the corners that heard put the sender within 90 degrees of `bearing`. */
function observeHit (belief: Belief, bearing: number): void {
  for (let b = 0; b < BINS; b++) belief.hits[b] = (belief.hits[b] ?? 0) + Math.log(Math.abs(angleDistance(b, bearing)) < 90 ? pHitIn : 1 - pHitIn);
}

/** The log likelihood of bin `b` for level `k`, the three states summed with equal prior. */
function levelLogLikelihood (L: Float64Array, b: number): number {
  const m = Math.max(L[b * STATES] ?? 0, L[b * STATES + 1] ?? 0, L[b * STATES + 2] ?? 0);
  let sum = 0;
  for (let s = 0; s < STATES; s++) sum += Math.exp((L[b * STATES + s] ?? 0) - m);
  return m + Math.log(sum / STATES);
}

/** The posterior over the bearing, normalised to sum 1. */
function posterior (belief: Belief): Float64Array {
  const logp = new Float64Array(BINS);
  for (let b = 0; b < BINS; b++) {
    let v = belief.hits[b] ?? 0;
    for (const L of belief.levels) v += levelLogLikelihood(L, b);
    logp[b] = v;
  }
  const m = Math.max(...logp);
  let sum = 0;
  for (let b = 0; b < BINS; b++) {
    logp[b] = Math.exp((logp[b] ?? 0) - m);
    sum += logp[b] ?? 0;
  }
  for (let b = 0; b < BINS; b++) logp[b] = (logp[b] ?? 0) / sum;
  return logp;
}

/** The bin with the most belief, and the belief within `window` degrees of it. */
function summarize (p: Float64Array): { mode: number; mass: number } {
  let mode = 0;
  for (let b = 1; b < BINS; b++) if ((p[b] ?? 0) > (p[mode] ?? 0)) mode = b;
  let mass = 0;
  for (let b = 0; b < BINS; b++) if (Math.abs(angleDistance(b, mode)) <= window) mass += p[b] ?? 0;
  return { mode, mass };
}

/** How likely each level is the carrier, the one with a lobe: the lobe state's share of the three, weighted by the posterior over the bearing. */
function carrierProbabilities (belief: Belief, p: Float64Array): number[] {
  return belief.levels.map(function lobeShare (L: Float64Array): number {
    let total = 0;
    for (let b = 0; b < BINS; b++) total += (p[b] ?? 0) * stateShare(L, b, 1);
    return total;
  });
}

/** The share of state `s` among the three at bin `b` of a level. */
function stateShare (L: Float64Array, b: number, s: number): number {
  const m = Math.max(L[b * STATES] ?? 0, L[b * STATES + 1] ?? 0, L[b * STATES + 2] ?? 0);
  let sum = 0;
  for (let t = 0; t < STATES; t++) sum += Math.exp((L[b * STATES + t] ?? 0) - m);
  return Math.exp((L[b * STATES + s] ?? 0) - m) / sum;
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
    const inside = insideLobe(b, heading);
    let q = 0;
    for (let s = 0; s < STATES; s++) q += stateShare(L, b, s) * hearingProbability(s, inside);
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
 * `restMs`. Returns the heading at rest.
 */
async function turnAndRest (ctx: Context, actuators: Actuators, target: number | null): Promise<number> {
  if (target !== null) await actuators.motor.roll(0, target);
  const t0 = performance.now();
  await wait(200);
  while (performance.now() - t0 < restMs && !ctx.motion.aborted && !isStill(ctx)) await wait(50);
  return headingNow(ctx);
}

/** `status.isStill` without the throw: false while no fresh sample has come. */
function isStill (ctx: Context): boolean {
  try { return ctx.status.isStill; }
  catch { return false; }
}

/**
 * One standing round: reads the corners into every frame the beat expects
 * until the ladder round is over, and folds each read that landed into the
 * belief. The frames themselves arrive through the beat tracker. Returns
 * the reads that landed and named a side.
 */
async function listenAndRead (ctx: Context, beat: Beat, ladder: Ladder, reads: number, belief: Belief): Promise<number> {
  const t0 = performance.now();
  let hits = 0;
  while (performance.now() - t0 < ladder.roundMs && !ctx.motion.aborted) {
    const receivers = await readAtNextFrame(ctx, beat, ladder, reads);
    if (receivers === null) continue;
    const bearing = hitBearing(receivers, headingNow(ctx));
    if (bearing === null) continue;
    observeHit(belief, bearing);
    hits++;
  }
  return hits;
}

/** Where the corners that heard put the sender: the heading plus their mean angle; null for opposite corners or all four, which name no side. */
function hitBearing (receivers: number[], heading: number): number | null {
  let sx = 0, sy = 0;
  for (const i of receivers) {
    sx += Math.cos((corners[i] ?? 0) * Math.PI / 180);
    sy += Math.sin((corners[i] ?? 0) * Math.PI / 180);
  }
  if (Math.hypot(sx, sy) < 0.5) return null;
  return mod360(heading + Math.atan2(sy, sx) * 180 / Math.PI);
}
