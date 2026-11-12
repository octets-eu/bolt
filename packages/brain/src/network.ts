// The connectome as a running network: circuit.json's neurons and edges. One
// `step` per motion sample:
//
//   1. input neurons take their port's value from the observation layer,
//      with `rateTauMs` its events per second smoothed, times `gain`; among
//      them the Bolt's own motion, role `self`: its turn (axis turned, deg)
//      and its step over the floor (axes fwd and right, cm); then the
//      gated neurons (`of`, `gate`): a receiver's rate times the share of the
//      gate neurons in their group's rates, the distance belief of the last step
//   2. the step carries the belief along: the ring turns by the parallax of
//      the believed distance, the distance slides by the step along the
//      believed bearing; evidence forgets with the travel, in cm (tauCm) or
//      in radians of the step over the believed distance (tauParallax)
//   3. the ring shifts against the turn (ring.ts)
//   4. evidence neurons add their input to what they hold; the rate of each
//      is exp of its evidence less the peak of its group (the neurons of its
//      role), so the peak reads 1 and a flat group reads all 1
//   5. leaky neurons (tauMs) integrate their input, clamped to 0..1
//   6. the rest, in the circuit's order, are max(0, bias + input) at once
//
// The motor and the referee read `output`, the neuron behind a port by
// circuit.json's `outputs`, and no neuron's name.
//
// Nothing in here knows a Bolt; the constants are in circuit.json, read by
// load.ts in Node and by the browser app's bundler.

import { shiftRing } from './ring';
import type { Circuit, Estimate, NeuronDef, OutputPort, Sources } from './types';

const mod360 = (a: number): number => ((a % 360) + 360) % 360;
const wrap180 = (a: number): number => ((a + 540) % 360) - 180;

/** A gated neuron: its index, the neuron it is `of`, its gate neurons, the evidence neurons of the gates' group. */
type Gated = [number, number, number[], number[]];

export class Network {

  readonly neurons: NeuronDef[];
  readonly index: Map<string, number>;
  readonly rate: Float64Array;
  readonly evidence: Float64Array;
  readonly inputs: [number, number][][];      // per neuron, its [pre, weight]
  readonly sensory: Set<number>;                // the input neurons
  readonly ring: number[];
  readonly distance: number[];
  readonly gated: Gated[];
  readonly self: Record<string, number>;      // the Bolt's own motion: axis -> neuron, turned, fwd, right
  readonly groups = new Map<string, number[]>();   // role -> the indexes of its evidence neurons
  readonly smoothed = new Map<number, number>();   // per input neuron with rateTauMs, its events per second
  readonly outputs: Record<string, number>;   // output port -> neuron

  constructor (circuit: Circuit) {
    this.neurons = circuit.neurons;
    this.index = new Map(this.neurons.map((n, i) => [n.id, i]));
    this.rate = new Float64Array(this.neurons.length);
    this.evidence = new Float64Array(this.neurons.length);
    this.inputs = this.neurons.map(() => []);
    for (const [pre, post, w] of circuit.edges) this.inputs[this.id(post)]!.push([this.id(pre), w]);
    this.sensory = new Set(this.neurons.flatMap((n, i) => (n.port ? [i] : [])));
    this.ring = this.neurons.flatMap((n, i) => (n.role === 'ring' ? [i] : []));
    this.distance = this.neurons.flatMap((n, i) => (n.role === 'distance' ? [i] : []));
    this.gated = this.neurons.flatMap((n, i): Gated[] => {
      if (!n.of) return [];
      const gate = (n.gate ?? []).map((g) => this.id(g)), role = this.neurons[gate[0]!]!.role;
      return [[i, this.id(n.of), gate, this.neurons.flatMap((m, k) => (m.role === role && m.evidence ? [k] : []))]];
    });
    this.self = Object.fromEntries(this.neurons.flatMap((n, i) => (n.role === 'self' && n.axis !== undefined ? [[n.axis, i] as [string, number]] : [])));
    for (const [i, n] of this.neurons.entries()) if (n.evidence) this.groups.set(n.role, [...(this.groups.get(n.role) ?? []), i]);
    this.outputs = Object.fromEntries(Object.entries(circuit.outputs).map(([port, name]) => [port, this.id(name)]));
    this.normalize();
  }

  /** The index of the neuron named; the circuit names neurons that exist. */
  private id (name: string): number {
    const i = this.index.get(name);
    if (i === undefined) throw new Error(`circuit: no neuron ${name}`);
    return i;
  }

  /** The rate of the neuron behind an output port. */
  output (port: OutputPort): number { return this.rate[this.outputs[port]!]!; }

  ringRates (): Float64Array { return Float64Array.from(this.ring, (i) => this.rate[i]!); }

  /** The ring's peak as the believed bearing off the nose; its share of the ring's mass as the confidence, 1/N flat, 1 for one bin; the expected distance over the bands. */
  estimate (): Estimate {
    let peak = this.ring[0]!, sum = 0;
    for (const i of this.ring) { if (this.rate[i]! > this.rate[peak]!) peak = i; sum += this.rate[i]!; }
    return { angle: this.neurons[peak]!.angle!, length: 1 / sum, ...(this.distance.length ? { distance: this.believedDistance() } : {}) };
  }

  believedDistance (): number {
    let sum = 0, acc = 0;
    for (const i of this.distance) { const [lo, hi] = this.neurons[i]!.cm!; sum += this.rate[i]!; acc += this.rate[i]! * (lo + hi) / 2; }
    return acc / sum;
  }

  /** The ring's values, evidence for evidence neurons, else rates, shifted by `d` degrees (ring.ts). */
  turn (d: number): void {
    const store = this.neurons[this.ring[0]!]?.evidence ? this.evidence : this.rate;
    const shifted = shiftRing(Float64Array.from(this.ring, (i) => store[i]!), d);
    this.ring.forEach((i, j) => { store[i] = shifted[j]!; });
  }

  /**
   * The belief carried along a step of `{ fwd, right }` cm in the Bolt's
   * frame: a frame is a bearing from where the Bolt stood, so the
   * point the belief names, at the believed bearing and distance, is placed
   * anew relative to the Bolt, the ring turned to it and the distance slid to
   * it. Evidence earned at a place is stale once the Bolt has moved on, so
   * neurons with tauCm forget with the travel: the distance, and the ring if
   * the circuit says so.
   */
  carry ({ fwd, right }: { fwd: number; right: number }): void {
    const stepCm = Math.hypot(fwd, right);
    if (stepCm <= 0.2 || !this.distance.length) return;
    const d = this.believedDistance(), est = this.estimate();
    const b = est.angle * Math.PI / 180;
    const px = d * Math.sin(b) - right, py = d * Math.cos(b) - fwd;
    this.turn(-wrap180(mod360(Math.atan2(px, py) * 180 / Math.PI) - mod360(est.angle)));
    const [lo, hi] = this.neurons[this.distance[0]!]!.cm!, bandCm = hi - lo;
    const shift = (Math.hypot(px, py) - d) / bandCm;
    if (Math.abs(shift) > 0.02) {
      const n = this.distance.length, at = (k: number): number => this.evidence[this.distance[Math.min(n - 1, Math.max(0, k))]!]!;
      const out = this.distance.map((_, i) => { const src = i - shift, k = Math.floor(src), f = src - k; return at(k) * (1 - f) + at(k + 1) * f; });
      this.distance.forEach((i, k) => { this.evidence[i] = out[k]!; });
    }
    // forgetting with the travel: evidence earned at a place goes stale once the Bolt has moved on. tauCm in
    // centimetres; tauParallax in radians of the step over the believed distance, the angle the sender could have
    // shifted by, so a close pass forgets abruptly and a far approach gently; the distance floored at a Bolt's width
    const potential = stepCm / Math.max(7, d);
    for (const [i, n] of this.neurons.entries()) {
      if (!n.evidence) continue;
      if (typeof n.tauCm === 'number' && Number.isFinite(n.tauCm)) this.evidence[i] = this.evidence[i]! * Math.exp(-stepCm / n.tauCm);
      if (typeof n.tauParallax === 'number' && Number.isFinite(n.tauParallax)) this.evidence[i] = this.evidence[i]! * Math.exp(-potential / n.tauParallax);
    }
  }

  /** Evidence neurons' rates: exp of the evidence less the group's peak. */
  normalize (): void {
    for (const ids of this.groups.values()) {
      let max = -Infinity;
      for (const i of ids) max = Math.max(max, this.evidence[i]!);
      for (const i of ids) this.rate[i] = Math.exp(this.evidence[i]! - max);
    }
  }

  /** One step of `dtMs`: `sources` from the observation layer, the Bolt's own motion among them. */
  step (sources: Sources, dtMs: number): void {
    for (const i of this.sensory) {
      const n = this.neurons[i]!;
      let v = sources[n.port!] ?? 0;
      if (n.rateTauMs !== undefined) {
        const m = this.smoothed.get(i) ?? 0;
        v = m + Math.min(1, dtMs / n.rateTauMs) * (v * 1000 / dtMs - m);
        this.smoothed.set(i, v);
      }
      this.rate[i] = v * (n.gain ?? 1);
    }
    for (const [i, of, gate, group] of this.gated) {
      let share = 0, total = 0;
      for (const g of gate) share += this.rate[g]!;
      for (const g of group) total += this.rate[g]!;
      this.rate[i] = total > 0 ? this.rate[of]! * share / total : 0;
    }
    const own = (axis: string): number => { const i = this.self[axis]; return i === undefined ? 0 : this.rate[i]!; };
    this.carry({ fwd: own('fwd'), right: own('right') });
    this.turn(own('turned'));
    const last = Float64Array.from(this.rate);
    for (const [i, n] of this.neurons.entries()) {
      if (!n.evidence) continue;
      let input = 0;
      for (const [p, w] of this.inputs[i]!) input += w * last[p]!;
      this.evidence[i] = this.evidence[i]! + input;
    }
    this.normalize();
    for (const [i, n] of this.neurons.entries()) {
      if (n.tauMs === undefined || n.evidence) continue;
      let input = n.bias ?? 0;
      for (const [p, w] of this.inputs[i]!) input += w * last[p]!;
      this.rate[i] = this.rate[i]! + Math.min(1, dtMs / n.tauMs) * (Math.min(1, Math.max(0, input)) - this.rate[i]!);
    }
    for (const [i, n] of this.neurons.entries()) {
      if (n.tauMs !== undefined || n.evidence || n.of || this.sensory.has(i)) continue;
      let input = n.bias ?? 0;
      for (const [p, w] of this.inputs[i]!) input += w * this.rate[p]!;
      this.rate[i] = Math.max(0, input);
    }
  }

}
