// The connectome as a running network: circuit.json's neurons and edges,
// each cell computed by its `model`, the cells that name a `population`
// normalised together; the file is checked first (check.ts). One `step` per
// motion sample:
//
//   1. `input` cells take their port's value from the observation layer,
//      with `rateTauMs` its events per second smoothed, times `gain`; among
//      them the Bolt's own motion, its turn in degrees and its step over the
//      floor, forward and to the right, in cm; then the
//      `product` cells: their input, a receiver's rate, times the share of the
//      cells on their gate edges in their population's rates, the distance
//      belief of the last step
//   2. the populations' operators, as the file declares them on each, every
//      one reading the beliefs as decoded before any of them ran: `carry`,
//      the step carries the belief along, a ring turned by the parallax of
//      the believed distance, a stack slid by the step along the believed
//      bearing; `forget`, evidence forgets with the travel, in cm (tauCm) or
//      in radians of the step over the believed distance (tauParallax)
//   3. `shift`, a ring shifts against the turn (ring.ts)
//   4. `evidence` cells add their input to what they hold; the rate of each
//      is exp of its evidence less the peak of its population, so the peak
//      reads 1 and a flat population reads all 1
//   5. `relu` cells, in the circuit's order, are max(0, bias + input) at once
//
// The estimate is read off the populations `readouts` names: the bearing
// from the one decoded by its peak, the distance from the one decoded by its
// mean. A population decoded by its peak is a ring, its cells evenly round
// by their `angle`; one decoded by its mean a stack, its cells bands of `cm`.
//
// The motor and the referee read `output`, the neuron behind a port by
// circuit.json's `outputs`, and no neuron's name.
//
// Nothing in here knows a Bolt; the constants are in circuit.json, read by
// load.ts in Node and by the browser app's bundler.

import { checkCircuit } from './check';
import { shiftRing } from './ring';
import type { Circuit, Estimate, NeuronDef, OutputPort, PopulationDef, Sources } from './types';

const mod360 = (a: number): number => ((a % 360) + 360) % 360;
const wrap180 = (a: number): number => ((a + 540) % 360) - 180;

export class Network {

  readonly neurons: NeuronDef[];
  readonly index: Map<string, number>;
  readonly rate: Float64Array;
  readonly evidence: Float64Array;
  readonly inputs: [number, number][][];      // per neuron, its [pre, weight] over the edges that add
  readonly gates: [number, number][][];       // and over its gate edges
  readonly ring: number[];                      // the cells of the bearing's population
  readonly distance: number[];                  // of the distance's, none without one
  readonly products: [number, number[]][];    // a product cell and the cells of its gates' population
  readonly populations = new Map<string, number[]>();   // population -> its cells, in the file's order
  readonly defs: Record<string, PopulationDef>;   // population -> its normalisation, decoding and operators
  readonly smoothed = new Map<number, number>();   // per input neuron with rateTauMs, its events per second
  readonly outputs: Record<string, number>;   // output port -> neuron

  constructor (circuit: Circuit) {
    checkCircuit(circuit);
    this.neurons = circuit.neurons;
    this.index = new Map(this.neurons.map((n, i) => [n.id, i]));
    this.rate = new Float64Array(this.neurons.length);
    this.evidence = new Float64Array(this.neurons.length);
    this.inputs = this.neurons.map(() => []);
    this.gates = this.neurons.map(() => []);
    for (const [pre, post, w, kind] of circuit.edges) (kind === 'gate' ? this.gates : this.inputs)[this.id(post)]!.push([this.id(pre), w]);
    this.defs = circuit.populations;
    for (const name of Object.keys(circuit.populations)) this.populations.set(name, []);
    for (const [i, n] of this.neurons.entries()) if (n.model === 'evidence') this.populations.get(n.population!)!.push(i);
    this.ring = this.populations.get(circuit.readouts.bearing)!;
    this.distance = circuit.readouts.distance === undefined ? [] : this.populations.get(circuit.readouts.distance)!;
    this.products = this.neurons.flatMap((n, i): [number, number[]][] => (n.model === 'product' ? [[i, this.populations.get(this.neurons[this.gates[i]![0]![0]]!.population!)!]] : []));
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

  /** The rates of a population's cells, in the file's order. */
  population (name: string): Float64Array {
    const ids = this.populations.get(name);
    if (!ids) throw new Error(`circuit: no population ${name}`);
    return Float64Array.from(ids, (i) => this.rate[i]!);
  }

  /** The ring's peak as the believed bearing off the nose; its share of the ring's mass as the confidence, 1/N flat, 1 for one bin; the expected distance over the bands. */
  estimate (): Estimate {
    return { ...this.peak(this.ring), ...(this.distance.length ? { distance: this.mean(this.distance) } : {}) };
  }

  /** A ring decoded: the `angle` of its highest rate, the first of equals, and that rate's share of the mass. */
  private peak (ids: number[]): { angle: number; length: number } {
    let peak = ids[0]!, sum = 0;
    for (const i of ids) { if (this.rate[i]! > this.rate[peak]!) peak = i; sum += this.rate[i]!; }
    return { angle: this.neurons[peak]!.angle!, length: 1 / sum };
  }

  /** A stack decoded: the rate-weighted mean of its cells' `cm` midpoints. */
  private mean (ids: number[]): number {
    let sum = 0, acc = 0;
    for (const i of ids) { const [lo, hi] = this.neurons[i]!.cm!; sum += this.rate[i]!; acc += this.rate[i]! * (lo + hi) / 2; }
    return acc / sum;
  }

  /** A ring's evidence shifted by `d` degrees (ring.ts). */
  private turn (ids: number[], d: number): void {
    const shifted = shiftRing(Float64Array.from(ids, (i) => this.evidence[i]!), d);
    ids.forEach((i, j) => { this.evidence[i] = shifted[j]!; });
  }

  /**
   * The populations' operators, in the order carry, forget, shift, each
   * reading the beliefs as decoded before any of them ran.
   *
   * `carry`: a frame is a bearing from where the Bolt stood, so the point the
   * belief names, at the believed bearing and distance, is placed anew
   * relative to the Bolt after its step: a ring is turned to it, a stack slid
   * to it, by parts of a band, not under `minShift` of one. `forget`:
   * evidence earned at a place is stale once the Bolt has moved on, so a cell
   * forgets with the travel, by its `tauCm` in centimetres, or by its
   * `tauParallax` in radians of the step over the believed distance, the
   * angle the sender could have shifted by: a close pass forgets abruptly, a
   * far approach gently, the distance floored at `floorCm`. Neither acts on
   * a step of `minCm` or less. `shift`: a ring turned against the Bolt's turn.
   */
  private operate (): void {
    const before = new Map<string, number>();   // per population the bearing it names, deg, or the distance, cm
    for (const [name, ids] of this.populations) before.set(name, this.defs[name]!.decode === 'peak' ? this.peak(ids).angle : this.mean(ids));
    const cell = (name: string): number => this.rate[this.id(name)]!;
    for (const [name, ids] of this.populations) {
      const c = this.defs[name]!.carry;
      if (!c) continue;
      const fwd = cell(c.fwd), right = cell(c.right);
      if (Math.hypot(fwd, right) <= c.minCm) continue;
      const ring = this.defs[name]!.decode === 'peak';
      const angle = before.get(ring ? name : c.bearing!)!, d = before.get(ring ? c.distance! : name)!;
      const b = angle * Math.PI / 180;
      const px = d * Math.sin(b) - right, py = d * Math.cos(b) - fwd;
      if (ring) { this.turn(ids, -wrap180(mod360(Math.atan2(px, py) * 180 / Math.PI) - mod360(angle))); continue; }
      const [lo, hi] = this.neurons[ids[0]!]!.cm!, bandCm = hi - lo;
      const shift = (Math.hypot(px, py) - d) / bandCm;
      if (Math.abs(shift) > c.minShift!) {
        const n = ids.length, at = (k: number): number => this.evidence[ids[Math.min(n - 1, Math.max(0, k))]!]!;
        const out = ids.map((_, i) => { const src = i - shift, k = Math.floor(src), f = src - k; return at(k) * (1 - f) + at(k + 1) * f; });
        ids.forEach((i, k) => { this.evidence[i] = out[k]!; });
      }
    }
    for (const [name, ids] of this.populations) {
      const f = this.defs[name]!.forget;
      if (!f) continue;
      const stepCm = Math.hypot(cell(f.fwd), cell(f.right));
      if (stepCm <= f.minCm) continue;
      const potential = f.distance === undefined ? null : stepCm / Math.max(f.floorCm!, before.get(f.distance)!);
      for (const i of ids) {
        const n = this.neurons[i]!;
        if (typeof n.tauCm === 'number' && Number.isFinite(n.tauCm)) this.evidence[i] = this.evidence[i]! * Math.exp(-stepCm / n.tauCm);
        if (potential !== null && typeof n.tauParallax === 'number' && Number.isFinite(n.tauParallax)) this.evidence[i] = this.evidence[i]! * Math.exp(-potential / n.tauParallax);
      }
    }
    for (const [name, ids] of this.populations) {
      const s = this.defs[name]!.shift;
      if (s) this.turn(ids, cell(s.by));
    }
  }

  /** Evidence cells' rates: exp of the evidence less their population's peak. */
  normalize (): void {
    for (const ids of this.populations.values()) {
      let max = -Infinity;
      for (const i of ids) max = Math.max(max, this.evidence[i]!);
      for (const i of ids) this.rate[i] = Math.exp(this.evidence[i]! - max);
    }
  }

  /** One step of `dtMs`: `sources` from the observation layer, the Bolt's own motion among them. */
  step (sources: Sources, dtMs: number): void {
    for (const [i, n] of this.neurons.entries()) {
      if (n.model !== 'input') continue;
      let v = sources[n.port!] ?? 0;
      if (n.rateTauMs !== undefined) {
        const m = this.smoothed.get(i) ?? 0;
        v = m + Math.min(1, dtMs / n.rateTauMs) * (v * 1000 / dtMs - m);
        this.smoothed.set(i, v);
      }
      this.rate[i] = v * (n.gain ?? 1);
    }
    for (const [i, group] of this.products) {
      let input = 0, share = 0, total = 0;
      for (const [p, w] of this.inputs[i]!) input += w * this.rate[p]!;
      for (const [g, w] of this.gates[i]!) share += w * this.rate[g]!;
      for (const g of group) total += this.rate[g]!;
      this.rate[i] = total > 0 ? input * share / total : 0;
    }
    this.operate();
    const last = Float64Array.from(this.rate);
    for (const [i, n] of this.neurons.entries()) {
      if (n.model !== 'evidence') continue;
      let input = 0;
      for (const [p, w] of this.inputs[i]!) input += w * last[p]!;
      this.evidence[i] = this.evidence[i]! + input;
    }
    this.normalize();
    for (const [i, n] of this.neurons.entries()) {
      if (n.model !== 'relu') continue;
      let input = n.bias ?? 0;
      for (const [p, w] of this.inputs[i]!) input += w * this.rate[p]!;
      this.rate[i] = Math.max(0, input);
    }
  }

}
