// The connectome as a running network: circuit.json's neurons and edges,
// fed by sensory_map.jsonc's channels. One `step` per motion sample:
//
//   1. sensory neurons take their drives, the map's pipelines over the sources,
//      added where two channels drive one neuron; among them the Bolt's own
//      motion, role `self`: its turn (axis turned, deg) and its step over the
//      floor (axes fwd and right, cm), from the observation layer; then the
//      gated neurons (`of`, `gate`): a receiver's rate times the share of the
//      gate neurons in their group's rates, the distance belief of the last step
//   2. the step carries the belief along: the ring turns by the parallax of
//      the believed distance, the distance slides by the step along the
//      believed bearing and forgets with the travel (tauCm)
//   3. the ring shifts against the turn (ring/ring.mjs)
//   4. evidence neurons add their input to what they hold; the rate of each
//      is exp of its evidence less the peak of its group (the neurons of its
//      role), so the peak reads 1 and a flat group reads all 1
//   5. leaky neurons (tauMs) integrate their input, clamped to 0..1
//   6. the rest, in the circuit's order, are max(0, bias + input) at once
//
// Nothing in here knows a Bolt; the constants are in the two data files,
// read by load.mjs in Node and by the browser app's bundler.

import { shiftRing } from './ring/ring.mjs';

/** sensory_map.jsonc's text as an object: the `//` comments dropped. */
export const parseJsonc = (text) => JSON.parse(text.replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/[^"\n]*$/gm, ''));

const mod360 = (a) => ((a % 360) + 360) % 360;
const wrap180 = (a) => ((a + 540) % 360) - 180;

export class Network {

  constructor ({ circuit, map }) {
    this.map = map;
    this.neurons = circuit.neurons;
    this.index = new Map(this.neurons.map((n, i) => [n.id, i]));
    this.rate = new Float64Array(this.neurons.length);
    this.evidence = new Float64Array(this.neurons.length);
    this.inputs = this.neurons.map(() => []);
    for (const [pre, post, w] of circuit.edges) this.inputs[this.index.get(post)].push([this.index.get(pre), w]);
    this.sensory = new Set(map.channels.map((c) => this.index.get(c.drive)));
    this.ring = this.neurons.flatMap((n, i) => (n.role === 'ring' ? [i] : []));
    this.distance = this.neurons.flatMap((n, i) => (n.role === 'distance' ? [i] : []));
    this.gated = this.neurons.flatMap((n, i) => (n.of ? [[i, this.index.get(n.of), n.gate.map((g) => this.index.get(g)), this.neurons.flatMap((m, k) => (m.role === this.neurons[this.index.get(n.gate[0])].role && m.evidence ? [k] : []))]] : []));
    this.self = Object.fromEntries(this.neurons.flatMap((n, i) => (n.role === 'self' ? [[n.axis, i]] : [])));   // the Bolt's own motion: turned, fwd, right
    this.groups = new Map();   // role -> the indexes of its evidence neurons
    for (const [i, n] of this.neurons.entries()) if (n.evidence) this.groups.set(n.role, [...(this.groups.get(n.role) ?? []), i]);
    this.state = map.channels.map(() => ({}));   // per channel, what its ops remember
    this.normalize();
  }

  get (id) { return this.rate[this.index.get(id)]; }

  ringRates () { return Float64Array.from(this.ring, (i) => this.rate[i]); }

  /** The ring's peak as the believed bearing off the nose; its share of the ring's mass as the confidence, 1/N flat, 1 for one bin; the expected distance over the bands. */
  estimate () {
    let peak = this.ring[0], sum = 0;
    for (const i of this.ring) { if (this.rate[i] > this.rate[peak]) peak = i; sum += this.rate[i]; }
    return { angle: this.neurons[peak].angle, length: 1 / sum, distance: this.distance.length ? this.believedDistance() : undefined };
  }

  believedDistance () {
    let sum = 0, acc = 0;
    for (const i of this.distance) { const [lo, hi] = this.neurons[i].cm; sum += this.rate[i]; acc += this.rate[i] * (lo + hi) / 2; }
    return acc / sum;
  }

  drive (channel, sources, dtMs, mem) {
    let v = sources[channel.source] ?? 0;
    for (const [k, op] of channel.pipeline.entries()) {
      switch (op.op) {
        case 'gain':  v *= op.k; break;
        case 'mul':   v *= sources[op.by] ?? 0; break;
        case 'sub':   v -= op.k; break;
        case 'clamp': v = Math.min(op.hi, Math.max(op.lo, v)); break;
        case 'adapt': {  // what is new: v less its own mean over tauMs, the worm's ASE dC/dt
          const a = Math.min(1, dtMs / op.tauMs);
          mem[k] = (mem[k] ?? v) + a * (v - (mem[k] ?? v));
          v -= mem[k];
          break;
        }
        case 'rate': {   // events per second, smoothed over tauMs
          const a = Math.min(1, dtMs / op.tauMs);
          mem[k] = (mem[k] ?? 0) + a * (v * 1000 / dtMs - (mem[k] ?? 0));
          v = mem[k];
          break;
        }
        default: throw new Error(`sensory_map: unknown op ${op.op}`);
      }
    }
    return v;
  }

  /** The ring's values, evidence for evidence neurons, else rates, shifted by `d` degrees (ring/ring.mjs). */
  turn (d) {
    const store = this.neurons[this.ring[0]]?.evidence ? this.evidence : this.rate;
    const shifted = shiftRing(Float64Array.from(this.ring, (i) => store[i]), d);
    this.ring.forEach((i, j) => { store[i] = shifted[j]; });
  }

  /**
   * The belief carried along a step of `{ fwd, right }` cm in the Bolt's
   * frame: a frame is a bearing from where the Bolt stood, so the
   * point the belief names, at the believed bearing and distance, is placed
   * anew relative to the Bolt, the ring turned to it and the distance slid to
   * it. The distance's evidence was earned at a place and is stale once the
   * Bolt has moved on, unlike a bearing the carry keeps true: it forgets with
   * the travel, tauCm.
   */
  carry ({ fwd, right }) {
    const stepCm = Math.hypot(fwd, right);
    if (stepCm <= 0.2 || !this.distance.length) return;
    const d = this.believedDistance(), est = this.estimate();
    const b = est.angle * Math.PI / 180;
    const px = d * Math.sin(b) - right, py = d * Math.cos(b) - fwd;
    this.turn(-wrap180(mod360(Math.atan2(px, py) * 180 / Math.PI) - mod360(est.angle)));
    const [lo, hi] = this.neurons[this.distance[0]].cm, bandCm = hi - lo;
    const shift = (Math.hypot(px, py) - d) / bandCm;
    if (Math.abs(shift) > 0.02) {
      const n = this.distance.length, at = (k) => this.evidence[this.distance[Math.min(n - 1, Math.max(0, k))]];
      const out = this.distance.map((_, i) => { const src = i - shift, k = Math.floor(src), f = src - k; return at(k) * (1 - f) + at(k + 1) * f; });
      this.distance.forEach((i, k) => { this.evidence[i] = out[k]; });
    }
    for (const i of this.distance) if (Number.isFinite(this.neurons[i].tauCm)) this.evidence[i] *= Math.exp(-stepCm / this.neurons[i].tauCm);
  }

  /** Evidence neurons' rates: exp of the evidence less the group's peak. */
  normalize () {
    for (const ids of this.groups.values()) {
      let max = -Infinity;
      for (const i of ids) max = Math.max(max, this.evidence[i]);
      for (const i of ids) this.rate[i] = Math.exp(this.evidence[i] - max);
    }
  }

  /** One step of `dtMs`: `sources` from the observation layer, the Bolt's own motion among them. */
  step (sources, dtMs) {
    for (const i of this.sensory) this.rate[i] = 0;
    for (const [c, channel] of this.map.channels.entries()) this.rate[this.index.get(channel.drive)] += this.drive(channel, sources, dtMs, this.state[c]);
    for (const [i, of, gate, group] of this.gated) {
      let share = 0, total = 0;
      for (const g of gate) share += this.rate[g];
      for (const g of group) total += this.rate[g];
      this.rate[i] = total > 0 ? this.rate[of] * share / total : 0;
    }
    const own = (axis) => (this.self[axis] === undefined ? 0 : this.rate[this.self[axis]]);
    this.carry({ fwd: own('fwd'), right: own('right') });
    this.turn(own('turned'));
    const last = Float64Array.from(this.rate);
    for (const [i, n] of this.neurons.entries()) {
      if (!n.evidence) continue;
      let input = 0;
      for (const [p, w] of this.inputs[i]) input += w * last[p];
      this.evidence[i] += input;
    }
    this.normalize();
    for (const [i, n] of this.neurons.entries()) {
      if (n.tauMs === undefined || n.evidence) continue;
      let input = n.bias ?? 0;
      for (const [p, w] of this.inputs[i]) input += w * last[p];
      this.rate[i] += Math.min(1, dtMs / n.tauMs) * (Math.min(1, Math.max(0, input)) - this.rate[i]);
    }
    for (const [i, n] of this.neurons.entries()) {
      if (n.tauMs !== undefined || n.evidence || n.of || this.sensory.has(i)) continue;
      let input = n.bias ?? 0;
      for (const [p, w] of this.inputs[i]) input += w * this.rate[p];
      this.rate[i] = Math.max(0, input);
    }
  }

}
