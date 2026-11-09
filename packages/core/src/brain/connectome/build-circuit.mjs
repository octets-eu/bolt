// Writes circuit.json, the seeker's connectome, in the worm's format
// (examples/worm): neurons { id, type, role, side, pos } and edges
// [pre, post, weight, type], type 0 chemical, signed; `pos` is the worm's
// anatomical position, unused here. Fields the worm does not have: `angle`,
// a neuron's direction off the nose, clockwise, deg; `evidence`, the neuron
// sums its input per step into log-evidence and its rate is the softmax
// over its role's group (network.mjs); `cm`, a distance neuron's band;
// `tauCm`, its evidence forgets with the travel; `bias`; `tauMs` for leaky
// neurons. Every constant of the brain is here or in sensory_map.jsonc; the
// runtime has none.
//
// The belief is the ring plus distance (found from 122 cm in 23.5 s,
// 2026-11-08): N ring neurons hold the log-evidence of the sender's bearing
// off the nose, BANDS distance neurons of BAND_CM its range. Every frame
// heard adds its channel's sector profile for the believed distance band to
// the ring, through a product neuron per band (role gated: the receiver's
// rate times the band's share of the distance belief), and its strength's
// range profile to the distance; every slot of the sender's schedule that
// went silent adds the profile of not hearing that channel; a corner read
// adds its corner's profile. A profile is the log of a rate over its mean,
// the rate measured over the 18 sweep and approach runs of 2026-10
// (experiments/replay.mjs --senses): frames per second the sender spent in
// each of 8 sectors about the nose, and in each band of distance. Without the
// silent slots every heard frame says "ahead", the front receivers hear
// better, and nothing says "behind". The range profiles go by physical
// strength: the short ladder is only sent when the brain believes it is near,
// so its channels were only recorded near and said 20 cm for a frame heard
// at a metre. The ring never forgets; it is turned against the yaw and, when
// the Bolt moves, by the parallax of the believed distance, so a frame heard
// a metre ago still points where the sender is from here; the turn and the
// step come in as the `self` neurons, like every other sense. The distance forgets
// with TAU_CM of travel: strength 16 arrives most when far, and its frames
// from 1.2 m held the believed distance at 120 cm while the truth went to 40.
// Bench (experiments/replay.mjs): recordings 75 % of seconds under 30 deg,
// the five runs of 2026-11-08 65 %, the distance 27 cm off on average.
//
//   npx tsx packages/core/src/brain/connectome/build-circuit.mjs
//
// OUT=<path> writes elsewhere, for a circuit under test on the replay bench
// (CIRCUIT=<path>); N, TAU_CM, W_DIST override.
//
// Fields beyond the worm's, continued: `of` and `gate`, a gated neuron's
// source and the distance neurons whose share scales it; `band`, its cm.

import { readFileSync, writeFileSync } from 'node:fs';
import { parseJsonc } from './network.mjs';

const map = parseJsonc(readFileSync(new URL('./sensory_map.jsonc', import.meta.url), 'utf8'));
const N        = Number(process.env.N ?? 36);         // ring neurons, 10 deg apart; 16 bins lost nine points against 36 on the bench (2026-11-08)
const BANDS = 10, BAND_CM = 20;                        // distance neurons
const TAU_CM   = Number(process.env.TAU_CM ?? 30);    // the distance forgets with the travel: recordings 72 to 75 %, the day's runs 56 to 65 %, |off| 28 to 27 cm
const W_DIST   = Number(process.env.W_DIST ?? 1);     // a frame's range profile onto the distance
const ROUND_SLOTS = 4;   // a channel is sent once per round of this many slots: the chance per slot of hearing it; measured and scored with 4 for both ladders

// --- the senses, measured: counts per sector about the nose, 0 ahead, clockwise, 45 deg each
const EXPOSURE_S = [3016, 3852, 5328, 5558, 6818, 3293, 3399, 2583].map((n) => n / 20);   // seconds the sender spent in each sector
const FRAMES = {   // frames heard per channel
  0: [62, 88, 40, 79, 87, 72, 27, 41], 1: [128, 142, 104, 153, 115, 108, 66, 78], 2: [177, 208, 212, 292, 236, 149, 129, 144],
  3: [233, 294, 363, 371, 301, 204, 235, 198], 4: [42, 27, 0, 13, 9, 28, 17, 51], 5: [85, 61, 9, 37, 47, 53, 40, 112], 6: [107, 106, 32, 79, 89, 101, 60, 142],
};
const CORNERS = { FL: [33, 10, 9, 19, 6, 5, 26, 57], FR: [55, 46, 40, 10, 1, 8, 10, 26], BR: [5, 5, 37, 85, 54, 2, 0, 6], BL: [4, 10, 22, 37, 55, 32, 26, 4] };   // landed reads naming the corner
const EPS_SECTOR = 0.5;   // counts added before the rate, so an empty sector is rare, not impossible
// the frames by sector within bands of distance (replay.mjs --senses --bands 40,80,120): a frame's bearing meaning
// depends on the range. Beyond 120 cm the strong channels are heard 2.5 times more often ahead than behind, between
// 40 and 80 cm they are flat, under 40 cm inverted, while the short ladder keeps an ahead lobe near; one profile over all
// distances said "ahead" for every strong frame and held the belief 40 to 50 deg ahead of the truth at 30 cm (run 9, 2026-11-09)
const BAND_EDGES_CM = [40, 80, 120];   // four bands: under 40, 40 to 80, 80 to 120, 120 and beyond
const EXPOSURE_BAND_SECTOR_S = [
  [  9,  15,  16,  26,  12,  19,  12,  16],
  [ 57,  50,  82,  81,  62,  45,  42,  37],
  [ 30,  49,  58,  61,  80,  42,  50,  34],
  [ 55,  80, 110, 110, 187,  58,  65,  42],
];   // seconds of exposure per band and sector
const FRAMES_BY_BAND = {
  0: [[  7,  18,  17,  17,  13,  13,   8,   2], [ 48,  48,  23,  51,  69,  45,  19,  37], [  7,  22,   0,  11,   5,  13,   0,   2], [  0,   0,   0,   0,   0,   1,   0,   0]],
  1: [[  7,  20,  13,  18,  15,  15,   7,   6], [ 62,  49,  76,  72,  64,  55,  45,  45], [ 35,  38,  10,  43,  15,  20,  11,  24], [ 24,  35,   5,  20,  21,  18,   3,   3]],
  2: [[  3,  16,  13,  18,  14,   8,   9,   6], [ 54,  53, 113,  87,  67,  54,  59,  43], [ 43,  44,  43,  59,  16,  34,  40,  33], [ 77,  95,  43, 128, 139,  53,  21,  62]],
  3: [[  2,  19,  12,  15,  13,  12,   5,   3], [ 53,  69, 105,  85,  71,  44,  71,  42], [ 38,  55,  66,  60,  25,  40,  64,  34], [140, 151, 180, 211, 192, 108,  95, 119]],
  4: [[ 19,  15,   0,  13,   7,  15,  16,  29], [ 23,  12,   0,   0,   2,  13,   1,  22], [  0,   0,   0,   0,   0,   0,   0,   0], [  0,   0,   0,   0,   0,   0,   0,   0]],
  5: [[ 23,  17,   7,  14,   7,  15,  23,  36], [ 45,  28,   2,  11,  15,  25,  17,  54], [ 17,  16,   0,  12,  25,  13,   0,  22], [  0,   0,   0,   0,   0,   0,   0,   0]],
  6: [[ 24,  28,  11,  15,   8,  23,  25,  34], [ 58,  45,  13,  17,  17,  31,  25,  69], [ 25,  33,   8,  47,  64,  47,  10,  39], [  0,   0,   0,   0,   0,   0,   0,   0]],
};   // frames heard per channel, band and sector
const MIN_FRAMES = 20;   // a channel with fewer frames in a band says nothing about the bearing there: no edges
// per band of distance, near to far: seconds of exposure and frames per second per physical strength of the long ladder
const EXPOSURE_BAND_S = [4, 125, 245, 219, 248, 164, 168, 202, 105, 78];
const RANGE = {
  2: [0, 0.77, 0.82, 0.64, 0.20, 0.07, 0.01, 0, 0, 0], 4: [0, 0.82, 1.06, 0.97, 0.59, 0.32, 0.45, 0.19, 0.14, 0.01],
  8: [0, 0.72, 1.15, 1.16, 0.87, 0.63, 0.98, 1.17, 1.02, 0.93], 16: [0, 0.67, 1.15, 1.21, 1.00, 0.86, 1.51, 1.92, 1.76, 2.10],
};
RANGE[1] = [RANGE[2][1], ...RANGE[2].slice(2), 0];   // strength 1, the short ladder's own: strength 2's profile one band nearer
const EPS_BAND = 0.3;   // added to the rates, less where the band's exposure is long; the first band has four seconds

// motor: F, B, R, L read the ring's vector; SEARCH is on unless that vector has a length;
// ROAM is the part of search with nothing heard at all
const SEARCH_K = 3.0;    // |F-B| + |R-L| of 1/3 switches search off
const AXIS_T   = 0.3;    // M_AXIS: the ring's nose-and-tail mode, cos(2 angle), over this
const ROAM_K   = 2.0;    // presence in frames per second that stops roaming, at 0.5

const deg = (d) => d * Math.PI / 180;
const ringAngle = (j) => j * 360 / N;
const id = (j) => `R${String(j).padStart(2, '0')}`;
const did = (i) => `D${String(i).padStart(2, '0')}`;
const r3 = (v) => Math.round(v * 1000) / 1000;
const logOverMean = (v) => { const mean = v.reduce((a, b) => a + b, 0) / v.length; return v.map((x) => Math.log(x / mean)); };
/** A sector profile onto the ring: the log of the rate over its mean, interpolated between the sector centres. */
const sectorProfile = (values) => {
  const ll = logOverMean(values);
  return Array.from({ length: N }, (_, j) => { const pos = ringAngle(j) / 45, k = Math.floor(pos), f = pos - k; return ll[k % 8] * (1 - f) + ll[(k + 1) % 8] * f; });
};
const sectorRate = (counts) => counts.map((c, i) => (c + EPS_SECTOR) / EXPOSURE_S[i]);                            // frames per second of exposure
const heardPerSlot = (counts) => sectorRate(counts).map((r) => Math.min(0.98, r * map.ir.beatMs * ROUND_SLOTS / 1000));   // chance per slot of the channel to hear it
const rangeProfile = (rates) => logOverMean(rates.map((v, i) => v + EPS_BAND / Math.max(1, EXPOSURE_BAND_S[i] / 50)));

const neurons = [], edges = [];
const neuron = (nid, role, extra = {}) => neurons.push({ id: nid, type: role, role, side: 'mid', pos: [0, 0, neurons.length], ...extra });
const edge = (pre, post, w) => { if (Math.abs(w) >= 0.001) edges.push([pre, post, r3(w), 0]); };

// observation: what the IR tells, see sensory_map.jsonc
for (const [c, a] of Object.entries(map.ir.corners)) neuron(`IR_${c}`, 'corner', { angle: a });
const channels = Object.entries(map.ir.channels).map(([ch, [ladder, strength]]) => ({ ch: Number(ch), ladder, strength }));
for (const { ch, ladder, strength } of channels) neuron(`IR_CH${ch}`, 'frame', { channel: ch, ladder, strength });    // a frame of the channel heard
for (const { ch, ladder, strength } of channels) neuron(`IR_SLOT${ch}`, 'slot', { channel: ch, ladder, strength });   // a slot of the channel gone silent
neuron('IR_ANY', 'presence');
neuron('IR_NEAR', 'near');
// the Bolt's own motion, from the yaw and the locator: read by the network's shift rules, not by weights
neuron('SELF_TURN', 'self', { axis: 'turned', unit: 'deg' });
neuron('SELF_FWD', 'self', { axis: 'fwd', unit: 'cm' });
neuron('SELF_RIGHT', 'self', { axis: 'right', unit: 'cm' });

// the belief: the ring and the distance, evidence neurons
for (let j = 0; j < N; j++) neuron(id(j), 'ring', { angle: ringAngle(j), evidence: true });
for (let i = 0; i < BANDS; i++) neuron(did(i), 'distance', { cm: [i * BAND_CM, (i + 1) * BAND_CM], tauCm: TAU_CM, evidence: true });
const ontoRing = (pre, profile) => profile.forEach((w, j) => edge(pre, id(j), w));
for (const c of Object.keys(CORNERS)) ontoRing(`IR_${c}`, sectorProfile(sectorRate(CORNERS[c])));
// a frame heard, gated by the believed distance: IR_CH<k>_B<j> is the receiver's rate times the share of the
// distance neurons in band j, with the band's own sector profile onto the ring (network.mjs, `of` and `gate`)
const bandLo = [0, ...BAND_EDGES_CM], bandHi = [...BAND_EDGES_CM, Infinity];
const inBand = (j) => neurons.filter((n) => n.role === 'distance' && n.cm[0] >= bandLo[j] && n.cm[0] < bandHi[j]).map((n) => n.id);
for (const { ch, ladder, strength } of channels) {
  for (let j = 0; j < bandLo.length; j++) {
    const counts = FRAMES_BY_BAND[ch][j];
    if (counts.reduce((a, b) => a + b, 0) < MIN_FRAMES) continue;
    const nid = `IR_CH${ch}_B${j}`;
    neuron(nid, 'gated', { of: `IR_CH${ch}`, gate: inBand(j), band: [bandLo[j], bandHi[j] === Infinity ? null : bandHi[j]], channel: ch, ladder, strength });
    ontoRing(nid, sectorProfile(counts.map((c, i) => (c + EPS_SECTOR) / EXPOSURE_BAND_SECTOR_S[j][i])));
  }
  ontoRing(`IR_SLOT${ch}`, sectorProfile(heardPerSlot(FRAMES[ch]).map((q) => 1 - q)));
  rangeProfile(RANGE[strength]).forEach((w, i) => edge(`IR_CH${ch}`, did(i), W_DIST * w));
}

// motor
neuron('M_FWD', 'steer', { angle: 0 });
neuron('M_RIGHT', 'steer', { angle: 90 });
neuron('M_BACK', 'steer', { angle: 180 });
neuron('M_LEFT', 'steer', { angle: 270 });
for (let j = 0; j < N; j++) {
  const a = deg(ringAngle(j));
  edge(id(j), 'M_FWD', Math.cos(a));   edge(id(j), 'M_BACK', -Math.cos(a));
  edge(id(j), 'M_RIGHT', Math.sin(a)); edge(id(j), 'M_LEFT', -Math.sin(a));
}
neuron('M_SEARCH', 'search', { bias: 1 });
for (const m of ['M_FWD', 'M_RIGHT', 'M_BACK', 'M_LEFT']) edge(m, 'M_SEARCH', -SEARCH_K);
neuron('M_AXIS', 'axis', { bias: -AXIS_T });
for (let j = 0; j < N; j++) edge(id(j), 'M_AXIS', Math.cos(2 * deg(ringAngle(j))));
neuron('M_ROAM', 'roam', { bias: 1 });
edge('IR_ANY', 'M_ROAM', -ROAM_K);
neuron('REQ_SHORT', 'request');
edge('IR_NEAR', 'REQ_SHORT', 1);

const circuit = {
  about: `Bolt seeker: IR observation -> ${N}-neuron egocentric ring of log-evidence plus ${BANDS} distance bands -> steering. `
    + 'Evidence neurons sum their input per step and their rate is the softmax over their group; the ring is shifted against the Bolt\'s turn (yaw) and by the parallax '
    + 'of the believed distance as the locator moves, the distance slid along the bearing and forgetting with the travel (tauCm); every other neuron is max(0, bias + sum of weight * rate).',
  neurons, edges,
};
writeFileSync(process.env.OUT ?? new URL('./circuit.json', import.meta.url), JSON.stringify(circuit));
console.log(`${neurons.length} neurons, ${edges.length} edges`);
