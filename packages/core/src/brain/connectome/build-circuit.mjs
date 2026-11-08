// Writes circuit.json, the seeker's connectome, in the worm's format
// (examples/worm): neurons { id, type, role, side, pos } and edges
// [pre, post, weight, type], type 0 chemical, signed. Three fields the worm
// does not need: `angle`, a neuron's direction off the nose, clockwise, deg;
// `tauMs`, leaky neurons only (the rest follow their input at once); `bias`.
// Every constant of the brain's wiring is here; the runtime has none.
//
//   npx tsx packages/core/src/brain/connectome/build-circuit.mjs
//
// OUT=<path> writes elsewhere, for a circuit under test on the replay bench
// (experiments/replay.mjs); TAU, A1, A2, B, CORNER, CORNER_N override constants.

import { writeFileSync } from 'node:fs';

const N        = Number(process.env.N ?? 36);     // ring neurons, 10 deg apart; 16 scored 41 % on the replay bench, 36 with the gain below 54 (2026-11-08)
const TAU_MS   = Number(process.env.TAU ?? 250);    // ring time constant; Infinity: the ring integrates and never leaks
// ring to ring: a1 cos(d) + a2 cos(2d) - b, under the gain that holds a bump for good, so the
// ring forgets: tuned in simulation (2026-11-06) at 16 neurons, 0.24, 0.12, 0.03, so that one corner
// read is held about 5 s and a ring full of evidence fades over 10 s, a direction remembered across
// a turn of search. The recurrent input sums over the ring, so the weights go with the size: at 36
// the old values pinned half the ring at 1, and on the replay bench 0.107 (the 16/36 scaling) scored
// 42 %, 0.14 scored 54, 0.18 scored 52 (2026-11-08). A bump at nose and tail at once has no vector
// and holds no longer than its input; the cos(2d) term keeps the axis through one sweep past the
// sender. b keeps the total down, so bumps compete.
const A1 = Number(process.env.A1 ?? 0.14), A2 = Number(process.env.A2 ?? 0.07), B = Number(process.env.B ?? 0.0175);
const CORNER   = Number(process.env.CORNER ?? 2.0);    // a corner that heard, onto the ring around its own direction, cos^CORNER_N over +-90
const CORNER_N = Number(process.env.CORNER_N ?? 2);    // the corner lobe's exponent: 2 is a half circle, 8 about +-45
const AXIAL    = Number(process.env.AXIAL ?? 1.5);    // a carrier frame: the sender inside the lobe, nose or tail, cos^4 at 0 and 180; 1.0 scanned 10 s before a bump
const MISS     = 0.6;    // a round of the ladder without its carrier: the sender is not at nose or tail, cos^4 inhibition
const GRADIENT = 2.0;    // a carrier frame while the closeness rises (falls) driving: the sender is ahead (behind), cos over +-90
// motor: F, B, R, L read the ring's vector; SEARCH is on unless that vector has a length;
// ROAM is the part of search with nothing heard at all
const SEARCH_K = 3.0;    // |F-B| + |R-L| of 1/3 switches search off
const AXIS_T   = 0.3;    // M_AXIS: the ring's nose-and-tail mode, cos(2 angle), over this
const ROAM_K   = 2.0;    // presence in frames per second that stops roaming, at 0.5

const deg = (d) => d * Math.PI / 180;
const ringAngle = (j) => j * 360 / N;
const id = (j) => `R${String(j).padStart(2, '0')}`;
const r3 = (v) => Math.round(v * 1000) / 1000;
const lobe = (d, p) => Math.max(0, Math.cos(deg(d))) ** p;

const neurons = [], edges = [];
const neuron = (nid, role, extra = {}) => neurons.push({ id: nid, type: role, role, side: 'mid', pos: [0, 0, neurons.length], ...extra });
const edge = (pre, post, w) => { if (Math.abs(w) >= 0.001) edges.push([pre, post, r3(w), 0]); };

// observation: what the IR tells, see sensory_map.jsonc
const CORNERS = { IR_FL: -45, IR_FR: 45, IR_BR: 135, IR_BL: -135 };
for (const [c, a] of Object.entries(CORNERS)) neuron(c, 'corner', { angle: a });
neuron('IR_AX', 'axial');
neuron('IR_MISS', 'axial');
neuron('IR_APPROACH', 'gradient', { angle: 0 });
neuron('IR_RECEDE', 'gradient', { angle: 180 });
neuron('IR_ANY', 'presence');
neuron('IR_NEAR', 'near');

// the ring
for (let j = 0; j < N; j++) neuron(id(j), 'ring', { angle: ringAngle(j), tauMs: Number.isFinite(TAU_MS) ? TAU_MS : null });   // null: no leak, see network.mjs
for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
  const d = ringAngle(j) - ringAngle(k);
  edge(id(k), id(j), A1 * Math.cos(deg(d)) + A2 * Math.cos(2 * deg(d)) - B);
}
for (let j = 0; j < N; j++) {
  const a = ringAngle(j);
  for (const [c, ca] of Object.entries(CORNERS)) edge(c, id(j), CORNER * lobe(a - ca, CORNER_N));
  edge('IR_AX', id(j), AXIAL * (lobe(a, 4) + lobe(a - 180, 4)));
  edge('IR_MISS', id(j), -MISS * (lobe(a, 4) + lobe(a - 180, 4)));
  edge('IR_APPROACH', id(j), GRADIENT * lobe(a, 1));
  edge('IR_RECEDE', id(j), GRADIENT * lobe(a - 180, 1));
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
  about: 'Bolt seeker: IR observation -> 16-neuron egocentric ring attractor -> steering. Ring neurons are leaky, clamped to 0..1, '
    + 'and shifted against the Bolt\'s own turn (yaw); every other neuron is max(0, bias + sum of weight * rate), evaluated in this order.',
  neurons, edges,
};
writeFileSync(process.env.OUT ?? new URL('./circuit.json', import.meta.url), JSON.stringify(circuit));
console.log(`${neurons.length} neurons, ${edges.length} edges`);
