// The shapes of the brain's two data files, as the network, the loader and
// the brain view read them. circuit.json: the neurons, the edges in the
// worm's format [pre, post, weight, type], `outputs`, the neuron behind each
// output port, and `vis`, the view's anatomy.
// sensory_map.jsonc: the observation layer's constants, `ir`, and the
// channels that turn its sources into the sensory neurons' drives. This is
// scheme 1, what build/build-circuit.ts writes; docs/core-brain.plan.md's phases
// B and C change it.

import type { LadderRange } from '@bolt/core';

export type V3 = [number, number, number];

/** A neuron of circuit.json. The network reads `role`, `evidence`, `cm`, `tauCm`, `tauParallax`, `bias`, `tauMs`, `of`, `gate`, `axis` and `angle`; the view the rest. */
export interface NeuronDef {
  id: string; type: string; role: string; side: string; pos: V3;
  angle?: number; channel?: number; ladder?: string; strength?: number;
  of?: string; gate?: string[]; band?: [number, number | null]; cm?: [number, number]; tauCm?: number; tauParallax?: number;
  bias?: number; tauMs?: number; evidence?: boolean; axis?: string; unit?: string;
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

export interface Circuit { about?: string; neurons: NeuronDef[]; edges: [string, string, number, number][]; outputs: Record<OutputPort, string>; vis: Vis }

/** An op of a channel's pipeline (network.ts, `drive`). */
export type PipelineOp =
  | { op: 'gain'; k: number } | { op: 'mul'; by: string } | { op: 'sub'; k: number }
  | { op: 'clamp'; lo: number; hi: number } | { op: 'adapt'; tauMs: number } | { op: 'rate'; tauMs: number };

/** A channel of sensory_map.jsonc: a source of the observation layer, through its pipeline, onto a neuron's drive. */
export interface MapChannel { drive: string; source: string; pipeline: PipelineOp[] }

/** The observation layer's constants, sensory_map.jsonc's `ir`. */
export interface IrConfig {
  channels: Record<string, [LadderRange, number]>;   // infrared channel -> its ladder and strength
  corners: Record<string, number>;                    // the receivers' angles off the nose, the builder's
  beatMs: number;
  repeat?: number;
  volley: { leadMs: number; reads: number; stepMs: number };
  carrier: { windowMs: number; minFrames: number };
  near: { windowMs: number; minFrames: number; lostMs: number };
  settleMs: number;
}

export interface SensoryMap { ir: IrConfig; channels: MapChannel[] }

/** The two data files together, as `Network` takes them. */
export interface Connectome { circuit: Circuit; map: SensoryMap }

/** The observation layer's output, a value per source name, read by the map's channels. */
export type Sources = Record<string, number>;

/** The motion sample the brain steps on: heading clockwise from the locator's +y, the locator in cm. */
export interface Motion { heading: number; x: number; y: number }

/** The network's estimate: the believed bearing off the nose, clockwise, its confidence, and the believed distance if the circuit has one. */
export interface Estimate { angle: number; length: number; distance?: number }
