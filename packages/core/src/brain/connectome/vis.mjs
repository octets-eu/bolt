// The connectome's anatomy, written into circuit.json as `vis` by
// build-circuit.mjs: what the wiring cannot say about how the brain would look
// under a microscope, the places and shapes of its neuropils and organs and
// where each cell body sits. The network never reads it; the brain view
// (apps/browser/src/brain-view) and drawings do, and derive everything else
// from the wiring: arbors, synapses, grades (docs/brain-view.plan.md).
//
// The body frame: centimetres from the ball's centre, x right, y the nose,
// z up; an azimuth is clockwise from the nose, as a neuron's `angle`.
//
// - The ball, about 7 cm across (docs/bolt-reference.md, 1 The ball).
// - The ring, a torus about the vertical axis, a neuron's wedge at its angle.
// - The distance column, coaxial above the ring, one layer per distance
//   neuron, near at the bottom.
// - Seven glomeruli in an arc in front, one per IR channel, the long ladder
//   left, the short right, by strength.
// - An ear nucleus inside each corner receiver, the corner neuron's body.
// - The motor neuropil below the ring.
// - Organs: the four ears on the ball's surface at the corners; the hearing
//   organ low in front, where the observation layer turns notifies into
//   frames and slots, holding the afferents' bodies; the muscle between the
//   wheels, where the motor layer reads the motor neurons.
// - Cell bodies on the rind, a sphere inside the ball, beside the neuropil
//   they serve; the afferents' in the hearing organ and the ear nuclei, the
//   self neurons' low in the body, where the motion comes from.

const BALL_R = 3.5;
const RIND_R = 3.05;
const RING = { at: [0, 0, -0.3], r: 1.45, tube: 0.27 };
const COLUMN = { at: [0, 0, 0], r: 0.58, z0: 0.42, dz: 0.21 };
const GLOMERULI = { r: 0.3, dist: 2.4, z: 1.15, azimuths: { long: [-57, -39, -21, -3], short: [21, 39, 57] } };
const EAR_NUCLEI = { r: 0.22, dist: 2.45, z: -0.3 };
const MOTOR = { at: [0, 0, -1.55], r: 0.68, flat: 0.45 };
const HEARING = { at: [0, 2.2, -1.15], r: 0.5 };
const MUSCLE = { at: [0, 0, -2.3], size: [1.1, 0.55, 0.3] };
const WHEELS = { r: 0.52, width: 0.2, at: [[-1, 0, -2.72], [1, 0, -2.72]] };
const EAR = { r: 0.35, depth: 0.12 };

const rad = (d) => d * Math.PI / 180;
const r2 = (v) => Math.round(v * 100) / 100;
const p = (v) => v.map(r2);
const add = (a, b) => a.map((x, i) => x + b[i]);
/** A point at `azimuth` deg off the nose, `dist` from the vertical axis, height `z`. */
const around = (azimuth, dist, z) => [dist * Math.sin(rad(azimuth)), dist * Math.cos(rad(azimuth)), z];
/** A point on the rind at `azimuth` and height `z`. */
const onRind = (azimuth, z) => around(azimuth, Math.sqrt(RIND_R ** 2 - z ** 2), z);
/** A point on the rind at `azimuth` and `elevation` deg above the horizontal. */
const onRindAt = (azimuth, elevation) => around(azimuth, RIND_R * Math.cos(rad(elevation)), RIND_R * Math.sin(rad(elevation)));

/** `vis` for the circuit's neurons; `map` is sensory_map.jsonc, for the channels and the corners. */
export function bodyLayout (neurons, map) {
  const channels = Object.entries(map.ir.channels).map(([ch, [ladder, strength]]) => ({ ch: Number(ch), ladder, strength }));
  const order = [...channels].sort((a, b) => (a.ladder === b.ladder ? a.strength - b.strength : a.ladder === 'long' ? -1 : 1));
  const azimuthOf = new Map();
  for (const ladder of ['long', 'short']) order.filter((c) => c.ladder === ladder).forEach((c, k) => azimuthOf.set(c.ch, GLOMERULI.azimuths[ladder][k]));
  const slotOf = new Map(order.map((c, k) => [c.ch, k]));   // a channel's place in the row of afferents
  const corners = map.ir.corners;
  const distance = neurons.filter((n) => n.role === 'distance').sort((a, b) => a.cm[0] - b.cm[0]);
  const layerZ = new Map(distance.map((n, i) => [n.id, COLUMN.z0 + i * COLUMN.dz]));
  const bandLows = [...new Set(neurons.filter((n) => n.role === 'gated').map((n) => n.band[0]))].sort((a, b) => a - b);   // the band groups, nearest first

  const glomeruli = Object.fromEntries(channels.map(({ ch }) => [ch, p(around(azimuthOf.get(ch), GLOMERULI.dist, GLOMERULI.z))]));
  const nuclei = Object.fromEntries(Object.entries(corners).map(([c, a]) => [c, p(around(a, EAR_NUCLEI.dist, EAR_NUCLEI.z))]));
  const hearing = HEARING.at;
  const fixed = {
    IR_ANY: add(hearing, [-0.45, 0, 0]),
    IR_NEAR: add(hearing, [0.45, 0, 0]),
    REQ_SHORT: add(hearing, [0.7, -0.35, 0.05]),
    SELF_TURN: [-0.45, -0.85, -2.25],
    SELF_FWD: [0, -0.95, -2.3],
    SELF_RIGHT: [0.45, -0.85, -2.25],
    M_SEARCH: [0, -0.45, -2],
    M_AXIS: [0, 0.45, -2],
    M_ROAM: [-1, -0.7, -1.95],
  };
  const soma = {};
  for (const n of neurons) {
    const row = (dz) => add(hearing, [-0.33 + 0.11 * slotOf.get(n.channel), -0.05, dz]);
    const at = fixed[n.id] ?? ({
      corner: () => around(corners[n.id.slice(3)], EAR_NUCLEI.dist, EAR_NUCLEI.z),
      frame: () => row(0.14),
      slot: () => row(-0.14),
      ring: () => onRind(n.angle, 0.35),
      distance: () => onRind(180, layerZ.get(n.id) + 0.25),
      gated: () => onRindAt(azimuthOf.get(n.channel), 50 + 9 * bandLows.indexOf(n.band[0])),
      steer: () => around(n.angle, 2.4, -1.75),
    }[n.role]?.());
    if (!at) throw new Error(`vis: no place for ${n.id} (${n.role})`);
    soma[n.id] = p(at);
  }

  return {
    frame: 'body: cm from the ball\'s centre, x right, y the nose, z up; azimuths clockwise from the nose',
    ball: { r: BALL_R },
    neuropils: {
      ring: { shape: 'torus', at: RING.at, r: RING.r, tube: RING.tube },
      column: { shape: 'stack', at: COLUMN.at, r: COLUMN.r, layers: Object.fromEntries([...layerZ].map(([id, z]) => [id, r2(z)])) },
      glomeruli: { shape: 'blob', r: GLOMERULI.r, at: glomeruli },
      earNuclei: { shape: 'blob', r: EAR_NUCLEI.r, at: nuclei },
      motor: { shape: 'blob', at: MOTOR.at, r: MOTOR.r, flat: MOTOR.flat },
    },
    organs: {
      ears: { shape: 'cap', r: EAR.r, depth: EAR.depth, at: Object.fromEntries(Object.entries(corners).map(([c, a]) => [c, p(around(a, BALL_R, 0))])) },
      hearing: { shape: 'blob', at: HEARING.at, r: HEARING.r },
      muscle: { shape: 'box', at: MUSCLE.at, size: MUSCLE.size },
      wheels: { shape: 'wheel', r: WHEELS.r, width: WHEELS.width, at: WHEELS.at },
    },
    soma,
  };
}
