// The connectome as a running network: circuit.json's neurons and edges,
// fed by sensory_map.jsonc's channels. One `step` per motion sample:
//
//   1. sensory neurons take their drives, the map's pipelines over the sources,
//      added where two channels drive one neuron
//   2. the ring shifts against the Bolt's turn (ring/ring.mjs)
//   3. leaky neurons (tauMs) integrate their input, all from the last rates,
//      clamped to 0..1
//   4. the rest, in the circuit's order, are max(0, bias + input) at once
//
// Nothing in here knows a Bolt; the constants are in the two data files.

import { readFileSync } from 'node:fs';
import { shiftRing } from './ring/ring.mjs';

const jsonc = (url) => JSON.parse(readFileSync(url, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/[^"\n]*$/gm, ''));

export function loadConnectome () {
  return {
    circuit: JSON.parse(readFileSync(new URL('./circuit.json', import.meta.url), 'utf8')),
    map: jsonc(new URL('./sensory_map.jsonc', import.meta.url)),
  };
}

export class Network {

  constructor ({ circuit, map }) {
    this.map = map;
    this.neurons = circuit.neurons;
    this.index = new Map(this.neurons.map((n, i) => [n.id, i]));
    this.rate = new Float64Array(this.neurons.length);
    this.inputs = this.neurons.map(() => []);
    for (const [pre, post, w] of circuit.edges) this.inputs[this.index.get(post)].push([this.index.get(pre), w]);
    this.sensory = new Set(map.channels.map((c) => this.index.get(c.drive)));
    this.ring = this.neurons.flatMap((n, i) => (n.role === 'ring' ? [i] : []));
    this.state = map.channels.map(() => ({}));   // per channel, what its ops remember
  }

  get (id) { return this.rate[this.index.get(id)]; }

  ringRates () { return Float64Array.from(this.ring, (i) => this.rate[i]); }

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

  /** One step of `dtMs`: `sources` from the observation layer, `turned` degrees clockwise since the last step. */
  step (sources, dtMs, turned) {
    for (const i of this.sensory) this.rate[i] = 0;
    for (const [c, channel] of this.map.channels.entries()) this.rate[this.index.get(channel.drive)] += this.drive(channel, sources, dtMs, this.state[c]);
    const shifted = shiftRing(this.ringRates(), turned);
    this.ring.forEach((i, j) => { this.rate[i] = shifted[j]; });
    const last = Float64Array.from(this.rate);
    for (const [i, n] of this.neurons.entries()) {
      if (!n.tauMs) continue;
      let input = n.bias ?? 0;
      for (const [p, w] of this.inputs[i]) input += w * last[p];
      this.rate[i] += Math.min(1, dtMs / n.tauMs) * (Math.min(1, Math.max(0, input)) - this.rate[i]);
    }
    for (const [i, n] of this.neurons.entries()) {
      if (n.tauMs || this.sensory.has(i)) continue;
      let input = n.bias ?? 0;
      for (const [p, w] of this.inputs[i]) input += w * this.rate[p];
      this.rate[i] = Math.max(0, input);
    }
  }

}
