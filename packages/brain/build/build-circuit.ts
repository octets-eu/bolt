// Writes src/circuit.json, the seeker's connectome, in the worm's format
// (examples/worm): neurons { id, type, role, side, pos } and edges
// [pre, post, weight, type], type 0 chemical, signed; `pos` is the worm's
// anatomical position, unused here. Fields the worm does not have: `angle`,
// a neuron's direction off the nose, clockwise, deg; `evidence`, the neuron
// sums its input per step into log-evidence and its rate is the softmax
// over its role's group (network.ts); `cm`, a distance neuron's band;
// `tauCm`, its evidence forgets with the travel in cm; `tauParallax`, it
// forgets with the travel over the believed distance, radians; `bias`; `tauMs` for leaky
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
// adds a lobe drawn at its receiver's angle (CORNER_G, CORNER_N). A frame's
// or a silence's profile is the log of a rate over its mean,
// the rate measured over the recordings with the sender's place known
// (senses.json, counted once by a replay option since retired): frames per
// second of the channel's ladder being sent with the sender in each of 8
// sectors about the nose, and in each band of distance. Without the silent
// slots every heard frame says "ahead", the front receivers hear better, and
// nothing says "behind". The ring never forgets; it is turned against the yaw and, when
// the Bolt moves, by the parallax of the believed distance, so a frame heard
// a metre ago still points where the sender is from here; the turn and the
// step come in as the `self` neurons, like every other sense. The distance forgets
// with TAU_CM of travel: strength 16 arrives most when far, and its frames
// from 1.2 m held the believed distance at 120 cm while the truth went to 40.
// Bench (bench/replay.mjs): recordings 75 % of seconds under 30 deg,
// the five runs of 2026-11-08 65 %, the distance 27 cm off on average.
//
//   npx tsx packages/brain/build/build-circuit.ts
//
// OUT=<path> writes elsewhere, for a circuit under test on the replay bench
// (CIRCUIT=<path>); N, TAU_CM, RING_TAU_RAD, W_DIST, CORNER_G, CORNER_N override.
//
// Fields beyond the worm's, continued: `of` and `gate`, a gated neuron's
// source and the distance neurons whose share scales it; `band`, its cm.
//
// `vis`, beside neurons and edges: the anatomy for the brain view, the
// neuropils' and organs' places and the cell bodies' (vis.ts); the network
// does not read it.

import { readFileSync, writeFileSync } from 'node:fs';
import type { LadderRange } from '@bolt/core';
import { parseJsonc } from '../src/network';
import type { Circuit, NeuronDef, SensoryMap } from '../src/types';
import { bodyLayout } from './vis';

/** senses.json: counts by sector of the sender's true bearing (8 x 45 deg, 0 ahead, clockwise) and by band of distance (bandCm, the last open), in samples at `hz`. */
interface Counted { sector: number[]; band: number[]; bandSector: number[][] }
interface Senses {
  about: string; sectors: number; bands: number; bandCm: number; hz: number;
  exposure: Record<LadderRange, Counted>;             // samples per ladder sent
  frames: Record<string, Counted>;                    // frames heard per channel
  corners: Record<string, { sector: number[]; bandSector: number[][] }>;   // reads landed per corner
}

const map = parseJsonc<SensoryMap>(readFileSync(new URL('../src/sensory_map.jsonc', import.meta.url), 'utf8'));
const N        = Number(process.env['N'] ?? 36);         // ring neurons, 10 deg apart; 16 bins lost nine points against 36 on the bench (2026-11-08)
const BANDS = 10, BAND_CM = 20;                        // distance neurons
const TAU_CM   = Number(process.env['TAU_CM'] ?? 30);    // the distance forgets with the travel: recordings 72 to 75 %, the day's runs 56 to 65 %, |off| 28 to 27 cm
// the ring forgets by the potential parallax of the travel, the step over the believed distance, in radians: a bearing
// is worth e times less once the sender could have shifted by this angle, so abruptly through a close pass and gently on
// a far approach. Infinity: never; a ring that never forgets is pinned by its approach evidence through a pass, six
// corner reads at 40 cm moved it 30 deg (run 12, 2026-11-09). Forgetting by centimetres (60 cm) lifted the seek runs of
// 11-08 from 34 to 60 % but is the same near and far.
const RING_TAU_RAD = Number(process.env['RING_TAU_RAD'] ?? 1);   // 1 rad, the user's pick (2026-11-09): the seek runs of 11-08 at 62 %, today's four at 38, the pass of run 11 followed; 0.5 gave 60 / 39, 0.3 53 / 44
const W_DIST   = Number(process.env['W_DIST'] ?? 1);     // a frame's range profile onto the distance
// a corner read onto the ring: a lobe drawn at the receiver's angle, G * max(0, cos(angle - corner))^n. The counted
// profiles put the front-right receiver's peak at 0 deg and the front-left's at 320, so a sender ahead-right was
// believed ahead and the belief sat left of the truth on every approach: the bench's side -13 deg, drawn +2, the
// share of seconds under 30 deg 38 to 50 % (2026-11-11). The bench climbs slowly past 4 (53 % at 10) with the
// belief sharper after each read; a wide lobe (n 1) beat a narrow one (n 2) at every gain
const CORNER_G = Number(process.env['CORNER_G'] ?? 4);
const CORNER_N = Number(process.env['CORNER_N'] ?? 1);

// --- the senses, measured: senses.json, counted over the recordings with the sender's place known. Counts of
// frames per channel and of landed reads per corner by sector of the sender's true bearing and by band of
// distance, and the exposure in each, per ladder the sender was sending: a channel can only be heard while its
// ladder is on, and the brain asks for the short ladder when it believes it is near, so against the whole
// exposure the short channels looked five times more frequent ahead than behind under 40 cm, the approaches, an
// artefact that pinned the belief ahead through a pass (run 11, 2026-11-09); against their own ladder's exposure
// they are flat there.
const S = JSON.parse(readFileSync(new URL('./senses.json', import.meta.url), 'utf8')) as Senses;
const secs = (samples: number): number => samples / S.hz;
const EPS_SECTOR = 0.5;   // counts added before a sector rate, so an empty sector is rare, not impossible
const EPS_BAND = 0.3;     // added to a band's rate, less where the band's exposure is long
const MIN_EXPOSURE_S = 5;    // a sector or band with less exposure of the channel's ladder says nothing: its weight is 0
const MIN_GROUP_S = 20;      // a band group with less exposure gets no product neuron
const MIN_FRAMES = 20;       // a channel with fewer frames in a band group says nothing about the bearing there
// the bearing profiles by distance band: beyond 120 cm the strong channels are heard 2.5 times more often ahead
// than behind, between 40 and 80 cm flat, under 40 cm inverted; one profile over all distances said "ahead" for
// every strong frame and held the belief 40 to 50 deg ahead of the truth at 30 cm (run 9, 2026-11-09)
const BAND_EDGES_CM = [40, 80, 120];   // four groups: under 40, 40 to 80, 80 to 120, 120 and beyond
const groupOf = (bandIndex: number): number => BAND_EDGES_CM.filter((e) => bandIndex * S.bandCm >= e).length;
const GROUPS = BAND_EDGES_CM.length + 1;
const groupLo: number[] = [0, ...BAND_EDGES_CM], groupHi: (number | null)[] = [...BAND_EDGES_CM, null];
/** The senses' fine bands summed into the groups: [group][sector]. */
const grouped = (bandSector: number[][]): number[][] => { const out = Array.from({ length: GROUPS }, () => new Array<number>(S.sectors).fill(0)); bandSector.forEach((row, b) => row.forEach((v, i) => { const g = out[groupOf(b)]!; g[i] = g[i]! + v; })); return out; };
/** The senses' bands onto the BANDS distance neurons: the last open band folded into the last neuron. */
const toBands = (a: number[]): number[] => Array.from({ length: BANDS }, (_, i) => (i === BANDS - 1 ? a.slice(i).reduce((x, y) => x + y, 0) : a[i]!));
/** Log of each value over the mean of the defined ones; undefined (null) values get 0, no weight. */
const logOverMean = (v: (number | null)[]): number[] => { const d = v.filter((x): x is number => x !== null); const mean = d.reduce((a, b) => a + b, 0) / d.length; return v.map((x) => (x === null ? 0 : Math.log(x / mean))); };
/** Frames per second of exposure per sector, null where the exposure is under MIN_EXPOSURE_S. */
const sectorRate = (counts: number[], exposure: number[]): (number | null)[] => counts.map((c, i) => (secs(exposure[i]!) < MIN_EXPOSURE_S ? null : (c + EPS_SECTOR) / secs(exposure[i]!)));
const channels = Object.entries(map.ir.channels).map(([ch, [ladder, strength]]) => ({ ch: Number(ch), ladder, strength }));

// motor: F, B, R, L read the ring's vector; SEARCH is on unless that vector has a length;
// ROAM is the part of search with nothing heard at all
const SEARCH_K = 3.0;    // |F-B| + |R-L| of 1/3 switches search off
const AXIS_T   = 0.3;    // M_AXIS: the ring's nose-and-tail mode, cos(2 angle), over this
const ROAM_K   = 2.0;    // presence in frames per second that stops roaming, at 0.5

const deg = (d: number): number => d * Math.PI / 180;
const ringAngle = (j: number): number => j * 360 / N;
const id = (j: number): string => `R${String(j).padStart(2, '0')}`;
const did = (i: number): string => `D${String(i).padStart(2, '0')}`;
const r3 = (v: number): number => Math.round(v * 1000) / 1000;
/** A sector profile onto the ring: the log of the rate over its mean, interpolated between the sector centres. */
const sectorProfile = (rates: (number | null)[]): number[] => {
  const ll = logOverMean(rates);
  return Array.from({ length: N }, (_, j) => { const pos = ringAngle(j) / 45, k = Math.floor(pos), f = pos - k; return ll[k % 8]! * (1 - f) + ll[(k + 1) % 8]! * f; });
};
/** Slots per round of the ladder: a channel is sent once per round. */
const roundS = (ladder: LadderRange): number => map.ir.beatMs * channels.filter((c) => c.ladder === ladder).length / 1000;
/**
 * Chance per slot of the channel to hear it: frames heard over slots sent (the exposure in rounds), a count
 * added on both sides so it stays off 0 and 1; null where the exposure is under MIN_EXPOSURE_S. As a rate
 * times the round it ran over 1 for a channel heard every round and, capped, made one silent slot say "not
 * here" at a weight of 3 (2026-11-09).
 */
const heardPerSlot = (counts: number[], exposure: number[], ladder: LadderRange): (number | null)[] => counts.map((c, i) => (secs(exposure[i]!) < MIN_EXPOSURE_S ? null : Math.min(0.95, (c + EPS_SECTOR) / (secs(exposure[i]!) / roundS(ladder) + 2 * EPS_SECTOR))));
/** Frames per second per distance neuron from counts per band and the ladder's exposure per band, in samples; null where the exposure is short. */
const bandRate = (counts: number[], exposure: number[]): (number | null)[] => {
  const c = toBands(counts), x = toBands(exposure).map(secs);
  return c.map((v, i) => (x[i]! < MIN_EXPOSURE_S ? null : v / x[i]! + EPS_BAND / Math.max(1, x[i]! / 50)));
};

const neurons: NeuronDef[] = [], edges: [string, string, number, number][] = [];
const neuron = (nid: string, role: string, extra: Partial<NeuronDef> = {}): void => { neurons.push({ id: nid, type: role, role, side: 'mid', pos: [0, 0, neurons.length], ...extra }); };
const edge = (pre: string, post: string, w: number): void => { if (Math.abs(w) >= 0.001) edges.push([pre, post, r3(w), 0]); };

// observation: what the IR tells, see sensory_map.jsonc
for (const [c, a] of Object.entries(map.ir.corners)) neuron(`IR_${c}`, 'corner', { angle: a });
for (const { ch, ladder, strength } of channels) neuron(`IR_CH${ch}`, 'frame', { channel: ch, ladder, strength });    // a frame of the channel heard
for (const { ch, ladder, strength } of channels) neuron(`IR_SLOT${ch}`, 'slot', { channel: ch, ladder, strength });   // a slot of the channel gone silent
neuron('IR_ANY', 'presence');
neuron('IR_NEAR', 'near');
// the Bolt's own motion, from the yaw and the locator: read by the network's shift rules, not by weights
neuron('SELF_TURN', 'self', { axis: 'turned', unit: 'deg' });
neuron('SELF_FWD', 'self', { axis: 'fwd', unit: 'cm' });
neuron('SELF_RIGHT', 'self', { axis: 'right', unit: 'cm' });

// the belief: the ring and the distance, evidence neurons
for (let j = 0; j < N; j++) neuron(id(j), 'ring', { angle: ringAngle(j), evidence: true, ...(Number.isFinite(RING_TAU_RAD) ? { tauParallax: RING_TAU_RAD } : {}) });
for (let i = 0; i < BANDS; i++) neuron(did(i), 'distance', { cm: [i * BAND_CM, (i + 1) * BAND_CM], tauCm: TAU_CM, evidence: true });
const ontoRing = (pre: string, profile: number[]): void => profile.forEach((w, j) => edge(pre, id(j), w));
for (const [c, a] of Object.entries(map.ir.corners)) ontoRing(`IR_${c}`, Array.from({ length: N }, (_, j) => CORNER_G * Math.max(0, Math.cos(deg(ringAngle(j) - a))) ** CORNER_N));   // a read lands whatever the ladder
// a frame heard, gated by the believed distance: IR_CH<k>_B<j> is the receiver's rate times the share of the
// distance neurons in band group j, with the group's own sector profile onto the ring (network.ts, `of` and `gate`)
const inGroup = (j: number): string[] => { const lo = groupLo[j]!, hi = groupHi[j]!; return neurons.filter((n) => n.role === 'distance' && n.cm![0] >= lo && (hi === null || n.cm![0] < hi)).map((n) => n.id); };
for (const { ch, ladder, strength } of channels) {
  const f = S.frames[ch], x = S.exposure[ladder];
  if (!f) continue;
  const counts = grouped(f.bandSector), exposure = grouped(x.bandSector);
  for (let j = 0; j < GROUPS; j++) {
    if (secs(exposure[j]!.reduce((a, b) => a + b, 0)) < MIN_GROUP_S || counts[j]!.reduce((a, b) => a + b, 0) < MIN_FRAMES) continue;
    const nid = `IR_CH${ch}_B${j}`;
    neuron(nid, 'gated', { of: `IR_CH${ch}`, gate: inGroup(j), band: [groupLo[j]!, groupHi[j]!], channel: ch, ladder, strength });
    ontoRing(nid, sectorProfile(sectorRate(counts[j]!, exposure[j]!)));
  }
  const silent = (q: number | null): number | null => (q === null ? null : 1 - q);
  ontoRing(`IR_SLOT${ch}`, sectorProfile(heardPerSlot(f.sector, x.sector, ladder).map(silent)));
  // the range: a frame heard by the channel's rate per band, a slot gone silent by the chance of not hearing it there;
  // the strong channels are heard at every distance while their ladder is on, so the far evidence is in the silences of the weak ones
  logOverMean(bandRate(f.band, x.band)).forEach((w, i) => edge(`IR_CH${ch}`, did(i), W_DIST * w));
  // the short ladder's silences stay off the distance: near, its weak levels are heard ahead and behind but not at the
  // sides, so their silent slots say "far" where the truth is 28 cm (the near path of 2026-11-09, pass 3)
  if (ladder === 'long') logOverMean(heardPerSlot(toBands(f.band), toBands(x.band), ladder).map(silent)).forEach((w, i) => edge(`IR_SLOT${ch}`, did(i), W_DIST * w));
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

const circuit: Circuit = {
  about: `Bolt seeker: IR observation -> ${N}-neuron egocentric ring of log-evidence plus ${BANDS} distance bands -> steering. `
    + 'Evidence neurons sum their input per step and their rate is the softmax over their group; the ring is shifted against the Bolt\'s turn (yaw) and by the parallax '
    + 'of the believed distance as the locator moves and forgets by the potential parallax of the step (tauParallax), the distance slid along the bearing and forgetting with the travel (tauCm); every other neuron is max(0, bias + sum of weight * rate).',
  neurons, edges,
  vis: bodyLayout(neurons, map),
};
writeFileSync(process.env['OUT'] ?? new URL('../src/circuit.json', import.meta.url), JSON.stringify(circuit));
console.log(`${neurons.length} neurons, ${edges.length} edges`);
