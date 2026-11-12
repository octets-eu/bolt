// The shape of the brain's data file, circuit.json, as the network, the
// observation layer, the motor and the brain view read it: `observation` and
// `motor`, the constants of the two layers; the neurons, an input neuron
// with the `port` of the observation layer it takes its value from; the
// edges in the worm's format [pre, post, weight, type]; `outputs`, the neuron
// behind each output port; and `vis`, the view's anatomy. This is scheme 1,
// what build/build-circuit.ts writes; docs/core-brain.plan.md's phase C
// changes it.

import type { LadderRange } from '@bolt/core';

export type V3 = [number, number, number];

/** A neuron of circuit.json. The network reads `port`, `gain`, `rateTauMs`, `role`, `evidence`, `cm`, `tauCm`, `tauParallax`, `bias`, `tauMs`, `of`, `gate`, `axis` and `angle`; the view the rest. */
export interface NeuronDef {
  id: string; type: string; role: string; side: string; pos: V3;
  angle?: number; channel?: number; ladder?: string; strength?: number;
  of?: string; gate?: string[]; band?: [number, number | null]; cm?: [number, number]; tauCm?: number; tauParallax?: number;
  bias?: number; tauMs?: number; evidence?: boolean; axis?: string; unit?: string;
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

export interface Circuit { about?: string; observation: ObservationConfig; motor: MotorConfig; neurons: NeuronDef[]; edges: [string, string, number, number][]; outputs: Record<OutputPort, string>; vis: Vis }

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
  volley: { leadMs: number; reads: number; stepMs: number };
  carrier: { windowMs: number; minFrames: number };
  near: { windowMs: number; minFrames: number; lostMs: number };
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
