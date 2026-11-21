// The shape of the brain's data file, circuit.json, as the network, the
// observation layer, the motor and the brain view read it: `observation` and
// `motor`, the constants of the two layers; the neurons, an input neuron
// with the `port` of the observation layer it takes its value from; the
// edges [pre, post, weight], a fourth field naming a kind other than adding; `populations`, how the cells that name one are
// normalised and decoded; `outputs`, the neuron behind each output port;
// `readouts`, the populations behind the estimate; and `vis`, the view's
// anatomy. This is scheme 2 on its way, what build/build-circuit.ts writes;
// docs/core-brain.plan.md's phase C says what is still to come. check.ts
// checks a file against it at load.

import type { LadderRange } from '@bolt/core';

export type V3 = [number, number, number];

/**
 * How a cell computes: `input`, its port's value; `evidence`, its input added to what it holds, its rate from its
 * population's normalisation; `product`, its input times the share of the cells on its gate edges in their
 * population; `relu`, max(0, bias + input).
 */
export type Model = 'input' | 'relu' | 'evidence' | 'product';

/** A neuron of circuit.json. The network reads `model`, `population`, `port`, `gain`, `rateTauMs`, `cm`, `tauCm`, `tauParallax`, `bias` and `angle`; the view the rest. */
export interface NeuronDef {
  id: string; model: Model; population?: string; type: string; role: string; side: string; pos: V3;
  angle?: number; channel?: number; ladder?: string; strength?: number;
  band?: [number, number | null]; cm?: [number, number]; tauCm?: number; tauParallax?: number;
  bias?: number; axis?: string; unit?: string;
  port?: InputPort; gain?: number; rateTauMs?: number;   // an input neuron: the port's value, with `rateTauMs` its events per second smoothed, times `gain`
}

/** The brain view's anatomy, what the wiring cannot say: the neuropils' places and shapes and the somata, in the Bolt's body frame, cm, nose along +y. */
export interface Vis {
  frame: string;   // the body frame, in words
  ball: { r: number };
  neuropils: {
    ring: { shape: string; at: V3; r: number; tube: number };
    column: { shape: string; at: V3; r: number; layers: Record<string, number> };
    glomeruli: { shape: string; r: number; at: Record<string, V3> };
    earNuclei: { shape: string; r: number; at: Record<string, V3> };
    motor: { shape: string; at: V3; r: number; flat: number };
  };
  organs: {
    ears: { shape: string; r: number; depth: number; at: Record<string, V3> };
    hearing: { shape: string; at: V3; r: number };
    muscle: { shape: string; at: V3; size: V3 };
    wheels: { shape: string; r: number; width: number; at: V3[] };
  };
  soma: Record<string, V3>;
}

/** What the network hands out: the steering and the modes to the motor, the request for the short ladder to the referee. */
export type OutputPort =
  | 'steer.fwd' | 'steer.back' | 'steer.right' | 'steer.left'
  | 'mode.search' | 'mode.roam' | 'mode.axis' | 'mode.near'
  | 'request.short';

/** The Bolt's step since the last tick, the two cells that hold it, cm; an operator does nothing on a step of `minCm` or less. */
interface Step { fwd: string; right: string; minCm: number }

/**
 * A population: its cells' rates are exp of what they hold less the population's peak (`peak`); it is decoded as the
 * `angle` of its highest rate with that rate's share of the mass (`peak`), which makes it a ring, or as the
 * rate-weighted mean of its cells' `cm` midpoints (`mean`), a stack. Its operators (network.ts): `shift`, a ring
 * turned by the value of the cell `by`, deg; `carry`, a ring turned by the parallax of the step at the distance the
 * population `distance` names, a stack slid by the step along the bearing the population `bearing` names, not under
 * `minShift` of a band; `forget`, each cell by its `tauCm`, or by its `tauParallax` with the distance the population
 * `distance` names, floored at `floorCm`.
 */
export interface PopulationDef {
  normalize: 'peak'; decode: 'peak' | 'mean';
  shift?: { by: string };
  carry?: Step & { distance?: string; bearing?: string; minShift?: number };
  forget?: Step & { distance?: string; floorCm?: number };
}

/** An edge adds its weight times the pre's rate to the post's input; of kind `gate` it multiplies instead: a product cell's input times the sum over its gate edges, weight times rate, divided by the total of the gates' population. */
export type Edge = [pre: string, post: string, weight: number, kind?: 'gate'];

export interface Circuit {
  scheme: 2; about?: string; observation: ObservationConfig; motor: MotorConfig;
  neurons: NeuronDef[]; edges: Edge[];
  populations: Record<string, PopulationDef>;
  outputs: Record<OutputPort, string>;
  readouts: { bearing: string; distance?: string };   // the populations behind the estimate: the bearing decoded by its peak, the distance by its mean
  vis: Vis;
}

export type Corner = 'FL' | 'FR' | 'BR' | 'BL';

/** What the observation layer hands in, a value per port per tick. */
export type InputPort =
  | `frame.ch${number}` | `slot.ch${number}` | `corner.${Corner}`
  | 'frame.any' | 'frame.carrier' | 'frame.miss' | 'frame.closeness' | 'carrier.down' | 'carrier.up'
  | 'ladder.near' | 'ladder.settled'
  | 'self.turned' | 'self.fwd' | 'self.right' | 'self.still' | 'self.forward';

export type Sources = Partial<Record<InputPort, number>>;

/** The observation layer's constants, circuit.json's `observation`; build/build-circuit.ts says what each is. */
export interface ObservationConfig {
  channels: Record<string, [LadderRange, number]>;   // infrared channel -> its ladder and strength
  beatMs: number;
  repeat: number;
  secondNotifyMs: number;
  follow: { withinMs: number; pull: number };
  expectMs: number;
  expectLastMs: number;
  slots: { mode: 'late' | 'beat'; marginMs: number };
  volley: { leadMs: number; reads: number; stepMs: number };
  carrier: { windowMs: number; minFrames: number };
  near: { strength: number; windowMs: number; minFrames: number; lostMs: number };
  closenessRef: number;
  settleMs: number;
  watchdogMs: number;
  fireMs: number;
}

/** The motor's constants, circuit.json's `motor`; build/build-circuit.ts says what each is. */
export interface MotorConfig {
  seekSpeed: number; probeSpeed: number; listenMs: number; scanStep: number; scanHoldMs: number; roamSpeed: number;
  maxTurn: number; castDeg: number; castMs: number; nearCastDeg: number; nearDriveDeg: number;
}

/** The motion sample the brain steps on: heading clockwise from the locator's +y, the locator in cm. */
export interface Motion { heading: number; x: number; y: number }

/** The network's estimate: the believed bearing off the nose, clockwise, its confidence, and the believed distance if the circuit has one. */
export interface Estimate { angle: number; length: number; distance?: number }
