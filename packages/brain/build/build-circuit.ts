// Writes src/circuit.json, the seeker's connectome, grown from the worm's
// format (examples/worm): neurons { id, type, role, side, pos } and edges
// [pre, post, weight], signed; `pos` is the worm's anatomical position,
// unused here. Fields the worm does not have: `model`, how the cell computes
// (types.ts): a `port` makes an input, a `population` an evidence cell, a
// product is named one, anything else is a relu; a product's inputs are an
// edge from the receiver it multiplies and `gate` edges, the fourth field,
// from the distance cells whose share scales it;
// `population`, the cells an evidence cell is normalised with: it sums its
// input per step into log-evidence and its rate is the softmax over them
// (network.ts), the file's `populations` saying how each is normalised and
// decoded and which operators act on it with which cells and constants,
// `readouts` which two the estimate is read from; `angle`, a
// neuron's direction off the nose, clockwise, deg; `cm`, a distance neuron's band;
// `tauCm`, its evidence forgets with the travel in cm; `tauParallax`, it
// forgets with the travel over the believed distance, radians; `bias`.
// An input neuron carries `port`, the observation layer's value it
// takes each tick (an event counts on the tick it happened, else 0), `gain`
// and `rateTauMs`, its events per second smoothed. Every constant of the
// brain is here, the observation layer's and the motor's written out as
// `observation` and `motor`; the runtime has none.
//
// The belief is the ring plus distance (found from 122 cm in 23.5 s,
// 2026-11-08): N ring neurons hold the log-evidence of the sender's bearing
// off the nose, BANDS distance neurons of BAND_CM its range. Every frame
// heard adds its channel's sector profile for the believed distance band to
// the ring, through a product neuron per band (role gated: the receiver's
// rate times the band's share of the distance belief), and its strength's
// range profile to the distance; every slot of the sender's schedule that
// went silent adds the profile of not hearing that channel; a corner read
// adds a lobe drawn at its receiver's angle (CORNER_G, CORNER_N). The levels'
// profiles, both ladders', are drawn by hand from the body (REACH_4 and what
// follows it): the log of the chance to hear a level, or not to, over its
// mean. Without the silent
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
// Fields beyond the worm's, continued: `band`, the cm of distance a product
// cell stands for.
//
// `vis`, beside neurons and edges: the anatomy for the brain view, the
// neuropils' and organs' places and the cell bodies' (vis.ts); the network
// does not read it.

import { writeFileSync } from 'node:fs';
import { LADDERS } from '@bolt/core';
import type { LadderRange } from '@bolt/core';
import type { Circuit, Corner, Edge, MotorConfig, NeuronDef, ObservationConfig } from '../src/types';
import { bodyLayout } from './vis';

// --- the observation layer's constants, circuit.json's `observation`: what it knows of the ladder and the
// receivers (docs/bolt-reference.md section 7, communication.ts)
const OBSERVATION: ObservationConfig = {
  // channel -> ladder and strength, the sender's ladders (communication.ts, LADDERS, read from core's build: after
  // a change of ladder core is built first); a frame names its ladder and level
  channels: Object.fromEntries(Object.values(LADDERS).flatMap((l) => l.channels.map((ch, k): [number, [LadderRange, number]] => [ch, [l.range, l.strengths[k]!]]))),
  // the sender's beat: one command per 200 ms on its schedule (ladder.ts), the notify 45 ms after the frame;
  // a read lands only while the frame is in the air, 7.5 ms (behavior/beat.ts)
  beatMs: 200,
  // beats each level is held by the sender: 1 for the browser's runs; ladder.ts can hold 2
  repeat: 1,
  // a second notify of one frame comes within this (one in ten, 45 ms after the first) and is no new frame
  secondNotifyMs: 100,
  // a channel's expected notify is pulled `pull` of the way to each notify that comes within `withinMs` of it
  follow: { withinMs: 40, pull: 0.4 },
  // a channel stays expected, its frames read into, this long after it was last heard
  expectMs: 3000,
  // the channel heard last stays expected this long: far out it is the only one that arrives, and seldom
  expectLastMs: 10000,
  // a silent slot is booked when the next frame arrives, `late`, or once its channel's expected notify is
  // `marginMs` past with none, `beat`, on the channels still expected (observation.ts, `slots` and `silences`)
  slots: { mode: 'late', marginMs: 40 },
  // over the bridge a read lands at a 40 to 55 ms lead (utils/read-timing.mjs, 2026-11-06), and
  // commands reach the Bolt on a 15 ms grid: three reads 7 ms apart, leads 60 to 46, span a grid
  // slot (behavior/beat.ts: three land in 35 to 39 % of frames, five in 43 %); five loaded the link
  // so that the seeker's collision report came 400 ms after the sender's (2026-11-06)
  volley: { leadMs: 60, reads: 3, stepMs: 7 },
  // the carrier: the weakest level heard at least `minFrames` times in `windowMs`;
  // the level that is just arriving has an edge, nose or tail (communication.ts, LADDERS)
  carrier: { windowMs: 3000, minFrames: 2 },
  // near: the long ladder's level of `strength`, its weakest, heard in `minFrames` of the last
  // `windowMs` asks for the short ladder; nothing of the short one in `lostMs` asks back;
  // the referee switches the sender between the two (communication.ts, LADDERS)
  near: { strength: LADDERS.long.strengths[0]!, windowMs: 3500, minFrames: 2, lostMs: 3000 },
  // a frame's closeness is log2 of this over its strength: weaker frames arrive only near
  closenessRef: 32,
  // after the frames change ladder, the closeness is not compared for this long
  settleMs: 3000,
  // the watchdog: nothing heard for this long, the listen is re-armed through the queue
  watchdogMs: 1500,
  // ack timeout of a fired command that is not a timed read
  fireMs: 300,
};
// receivers at the corners, front left, front right, back right, back left, deg off the nose
const CORNERS: Record<string, number> = { FL: -45, FR: 45, BR: 135, BL: -135 };
// a read that landed is worth about three frames (replay bench, 2026-11-08)
const CORNER_GAIN = 3;

// --- the motor's constants, circuit.json's `motor` (motor.ts)
const MOTOR: MotorConfig = {
  seekSpeed:   32,    // roll speed, about 17 cm/s (40 gave 22); at 21 cm/s runs passed 15 cm off, at 13 a touch went unreported
  probeSpeed:  28,
  listenMs:    2500,  // standing on the axis before the probe
  scanStep:    45,    // deg per turn of the scan
  scanHoldMs:  1300,  // standing after each, a round and a half of the long ladder
  roamSpeed:   25,
  maxTurn:     35,    // deg per command
  castDeg:     45,    // weave amplitude while targeting: past the edge of the carrier's lobe
  castMs:      2500,  // weave period
  nearCastDeg: 15,
  nearDriveDeg: 30,
};

const N        = Number(process.env['N'] ?? 36);         // ring neurons, 10 deg apart; 16 bins lost nine points against 36 on the bench (2026-11-08)
const BANDS = 20, BAND_CM = 20;                        // distance neurons, to 4 m
const TAU_CM   = Number(process.env['TAU_CM'] ?? 30);    // the distance forgets with the travel: recordings 72 to 75 %, the day's runs 56 to 65 %, |off| 28 to 27 cm
// the ring forgets by the potential parallax of the travel, the step over the believed distance, in radians: a bearing
// is worth e times less once the sender could have shifted by this angle, so abruptly through a close pass and gently on
// a far approach. Infinity: never; a ring that never forgets is pinned by its approach evidence through a pass, six
// corner reads at 40 cm moved it 30 deg (run 12, 2026-11-09). Forgetting by centimetres (60 cm) lifted the seek runs of
// 11-08 from 34 to 60 % but is the same near and far.
const RING_TAU_RAD = Number(process.env['RING_TAU_RAD'] ?? 1);   // 1 rad, the user's pick (2026-11-09): the seek runs of 11-08 at 62 %, today's four at 38, the pass of run 11 followed; 0.5 gave 60 / 39, 0.3 53 / 44
const W_DIST   = Number(process.env['W_DIST'] ?? 1);     // a frame's range profile onto the distance
// the populations' operators (network.ts): no carrying and no forgetting on a step of STEP_MIN_CM or less, the
// distance not slid by less than SLIDE_MIN of a band, the ring's forgetting with the believed distance floored at
// FLOOR_CM, a Bolt's width
const STEP_MIN_CM = 0.2, SLIDE_MIN = 0.02, FLOOR_CM = 7;
// a corner read onto the ring: a lobe drawn at the receiver's angle, G * max(0, cos(angle - corner))^n. The counted
// profiles put the front-right receiver's peak at 0 deg and the front-left's at 320, so a sender ahead-right was
// believed ahead and the belief sat left of the truth on every approach: the bench's side -13 deg, drawn +2, the
// share of seconds under 30 deg 38 to 50 % (2026-11-11). The bench climbs slowly past 4 (53 % at 10) with the
// belief sharper after each read; a wide lobe (n 1) beat a narrow one (n 2) at every gain
const CORNER_G = Number(process.env['CORNER_G'] ?? 4);
const CORNER_N = Number(process.env['CORNER_N'] ?? 1);

/** The log of each value over the mean of all. */
const logOverMean = (v: number[]): number[] => { const mean = v.reduce((a, b) => a + b, 0) / v.length; return v.map((x) => Math.log(x / mean)); };
const channels = Object.entries(OBSERVATION.channels).map(([ch, [ladder, strength]]) => ({ ch: Number(ch), ladder, strength }));

// --- the ladders' levels, drawn by hand from the body: a level is heard all round inside its reach, at its
// reach's edge only with the sender ahead or behind, the receivers hearing along the nose's line further than
// across it, and beyond not at all; a stronger level reaches further. The chance to hear a slot of a level:
// IN_REACH inside its reach, falling over EDGE_CM at the reach, which is REACH_4 abeam for strength 4, REACH_STEP
// more for every doubling of the strength above it, half for every halving below it, the edge narrowing with
// the reach there, and AXIS times as far along the nose's line. A frame heard and a slot
// gone silent weigh as the log of that chance and of its complement over their means, NEVER the least a chance is
// taken for, so no place is ruled out by one frame. The constants are the user's; the bench judges them.
const REACH_4    = Number(process.env['REACH_4'] ?? 90);
const REACH_STEP = Number(process.env['REACH_STEP'] ?? 75);
const AXIS       = Number(process.env['AXIS'] ?? 2);
const IN_REACH   = Number(process.env['IN_REACH'] ?? 0.6);
const EDGE_CM    = Number(process.env['EDGE_CM'] ?? 25);
const NEVER      = 0.03;
const GROUP_CM = 40;   // the levels' bearing profiles by the believed distance, a product neuron per group of bands
/** The chance to hear a slot of a level of `strength` from `cm` away, the sender `angle` deg off the nose. */
const heard = (strength: number, cm: number, angle: number): number => {
  const abeam = strength >= 4 ? REACH_4 + REACH_STEP * Math.log2(strength / 4) : REACH_4 * strength / 4;
  const reach = abeam * (1 + (AXIS - 1) * Math.cos(angle * Math.PI / 180) ** 2);
  return Math.max(NEVER, IN_REACH / (1 + Math.exp((cm - reach) / (EDGE_CM * Math.min(1, abeam / REACH_4)))));
};

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

const neurons: NeuronDef[] = [], edges: Edge[] = [];
const neuron = (nid: string, role: string, extra: Partial<NeuronDef> = {}): void => {
  neurons.push({ id: nid, model: extra.port ? 'input' : extra.population ? 'evidence' : 'relu', type: role, role, side: 'mid', pos: [0, 0, neurons.length], ...extra });
};
const edge = (pre: string, post: string, w: number): void => { if (Math.abs(w) >= 0.001) edges.push([pre, post, r3(w)]); };
/** A product cell: the receiver `of` times the share of the distance cells `gates` in the distance belief. */
const product = (nid: string, of: string, gates: string[], extra: Partial<NeuronDef>): void => {
  neuron(nid, 'gated', { model: 'product', ...extra });
  edge(of, nid, 1);
  for (const g of gates) edges.push([g, nid, 1, 'gate']);
};

// observation: what the IR tells, each input neuron on its port (observation.ts)
// a read that landed: the corners that heard the frame, unless all four (the sender on top, or a level heard
// all round) or two opposite ones
for (const [c, a] of Object.entries(CORNERS)) neuron(`IR_${c}`, 'corner', { angle: a, port: `corner.${c as Corner}`, gain: CORNER_GAIN });
for (const { ch, ladder, strength } of channels) neuron(`IR_CH${ch}`, 'frame', { channel: ch, ladder, strength, port: `frame.ch${ch}` });    // a frame of the channel heard, its second notify not counted
for (const { ch, ladder, strength } of channels) neuron(`IR_SLOT${ch}`, 'slot', { channel: ch, ladder, strength, port: `slot.ch${ch}` });   // a slot of the sender's schedule on the channel gone silent
neuron('IR_ANY', 'presence', { port: 'frame.any', rateTauMs: 3000 });   // anything of the ladder: the sender is in range at all; frames per second
neuron('IR_NEAR', 'near', { port: 'ladder.near' });                     // the ladder's state, held by the observation layer with its hysteresis
// the Bolt's own motion since the last tick, from the yaw and the locator: the turn in degrees clockwise, the step
// in cm in its own frame; read by the populations' operators (`populations`, below), not by weights
neuron('SELF_TURN', 'self', { axis: 'turned', unit: 'deg', port: 'self.turned' });
neuron('SELF_FWD', 'self', { axis: 'fwd', unit: 'cm', port: 'self.fwd' });
neuron('SELF_RIGHT', 'self', { axis: 'right', unit: 'cm', port: 'self.right' });

// the belief: the ring and the distance, evidence neurons
for (let j = 0; j < N; j++) neuron(id(j), 'ring', { population: 'ring', angle: ringAngle(j), ...(Number.isFinite(RING_TAU_RAD) ? { tauParallax: RING_TAU_RAD } : {}) });
for (let i = 0; i < BANDS; i++) neuron(did(i), 'distance', { population: 'distance', cm: [i * BAND_CM, (i + 1) * BAND_CM], tauCm: TAU_CM });
const ontoRing = (pre: string, profile: number[]): void => profile.forEach((w, j) => edge(pre, id(j), w));
for (const [c, a] of Object.entries(CORNERS)) ontoRing(`IR_${c}`, Array.from({ length: N }, (_, j) => CORNER_G * Math.max(0, Math.cos(deg(ringAngle(j) - a))) ** CORNER_N));   // a read lands whatever the ladder
// a frame heard, gated by the believed distance: IR_CH<k>_B<j> is the receiver's rate times the share of the
// distance neurons in band group j, with the group's own sector profile onto the ring (network.ts, the product cells)
const cellsIn = (lo: number, hi: number | null): string[] => neurons.filter((n) => n.role === 'distance' && n.cm![0] >= lo && (hi === null || n.cm![0] < hi)).map((n) => n.id);
const ringAngles = Array.from({ length: N }, (_, j) => ringAngle(j)), bandMids = Array.from({ length: BANDS }, (_, i) => (i + 0.5) * BAND_CM);
const around = (f: (angle: number) => number): number => ringAngles.reduce((a, angle) => a + f(angle), 0) / N;   // the mean over every bearing
for (const { ch, ladder, strength } of channels) {
  // a frame heard, by the believed distance: its bearing profile at each group of bands' middle
  for (let lo = 0; lo < BANDS * BAND_CM; lo += GROUP_CM) {
    const nid = `IR_CH${ch}_B${lo / GROUP_CM}`, hi = lo + GROUP_CM < BANDS * BAND_CM ? lo + GROUP_CM : null;
    product(nid, `IR_CH${ch}`, cellsIn(lo, hi), { band: [lo, hi], channel: ch, ladder, strength });
    ontoRing(nid, logOverMean(ringAngles.map((angle) => heard(strength, lo + GROUP_CM / 2, angle))));
  }
  // a silent slot onto the ring, whatever the distance: the chance of silence at each bearing over every band
  ontoRing(`IR_SLOT${ch}`, logOverMean(ringAngles.map((angle) => bandMids.reduce((a, cm) => a + 1 - heard(strength, cm, angle), 0) / BANDS)));
  // the range: heard, and silent, at each band over every bearing
  logOverMean(bandMids.map((cm) => around((angle) => heard(strength, cm, angle)))).forEach((w, i) => edge(`IR_CH${ch}`, did(i), W_DIST * w));
  logOverMean(bandMids.map((cm) => 1 - around((angle) => heard(strength, cm, angle)))).forEach((w, i) => edge(`IR_SLOT${ch}`, did(i), W_DIST * w));
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

const STEP = { fwd: 'SELF_FWD', right: 'SELF_RIGHT', minCm: STEP_MIN_CM };
const circuit: Circuit = {
  scheme: 2,
  about: `Bolt seeker: IR observation -> ${N}-neuron egocentric ring of log-evidence plus ${BANDS} distance bands -> steering. `
    + 'Evidence neurons sum their input per step and their rate is the softmax over their group; the ring is shifted against the Bolt\'s turn (yaw) and by the parallax '
    + 'of the believed distance as the locator moves and forgets by the potential parallax of the step (tauParallax), the distance slid along the bearing and forgetting with the travel (tauCm); every other neuron is max(0, bias + sum of weight * rate).',
  observation: OBSERVATION, motor: MOTOR,
  neurons, edges,
  populations: {
    ring: {
      normalize: 'peak', decode: 'peak', shift: { by: 'SELF_TURN' },
      carry: { ...STEP, distance: 'distance' },
      forget: { ...STEP, distance: 'distance', floorCm: FLOOR_CM },
    },
    distance: {
      normalize: 'peak', decode: 'mean',
      carry: { ...STEP, bearing: 'ring', minShift: SLIDE_MIN },
      forget: { ...STEP },
    },
  },
  outputs: {
    'steer.fwd': 'M_FWD', 'steer.back': 'M_BACK', 'steer.right': 'M_RIGHT', 'steer.left': 'M_LEFT',
    'mode.search': 'M_SEARCH', 'mode.roam': 'M_ROAM', 'mode.axis': 'M_AXIS', 'mode.near': 'IR_NEAR',
    'request.short': 'REQ_SHORT',
  },
  readouts: { bearing: 'ring', distance: 'distance' },
  vis: bodyLayout(neurons, OBSERVATION.channels, CORNERS),
};
writeFileSync(process.env['OUT'] ?? new URL('../src/circuit.json', import.meta.url), JSON.stringify(circuit));
console.log(`${neurons.length} neurons, ${edges.length} edges`);
