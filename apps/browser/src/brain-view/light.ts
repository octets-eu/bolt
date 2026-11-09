// What makes a cell glow, from the network's rates, 0 dark to 1 bright, as
// calcium imaging shows a firing neuron: the rise is at once, the decay over
// DECAY_MS, so a frame heard for one 25 ms step stays visible for a moment.
//
// - An evidence cell (ring, distance) glows by how far it stands out of its
//   group: its rate less the group's mean, over one less the mean. The rates
//   are the softmax read with the peak at 1, so a flat belief, every rate 1,
//   is dark, and a sharp peak is bright.
// - A self cell glows by its motion per second against a full scale: 90 deg
//   a second of turn, 20 cm a second of step, about the seek speed.
// - Every other cell by 1 - exp(-rate): a count, a smoothed rate or a motor
//   neuron's max(0, input), all unbounded, saturating towards 1.
//
// A step's glow is held as a peak until the next frame takes it, so no step
// between two frames is lost; the last step's glow is the floor, so a steady
// cell does not flicker between steps.

const DECAY_MS = 300;
const FULL = { turned: 90, fwd: 20, right: 20 } as Record<string, number>;

/** The part of the network the light reads; network.mjs's Network has it. */
export interface Rates { rate: Float64Array; neurons: { role: string; evidence?: boolean; axis?: string }[]; groups: Map<string, number[]> }

export class Light {

  /** The glow on screen per neuron, after the decay. */
  readonly shown: Float32Array;
  private readonly peak: Float32Array;
  private readonly level: Float32Array;

  constructor (count: number) {
    this.shown = new Float32Array(count);
    this.peak = new Float32Array(count);
    this.level = new Float32Array(count);
  }

  /** One network step of `dtMs`. */
  take (net: Rates, dtMs: number): void {
    const { rate, neurons } = net;
    for (const ids of net.groups.values()) {
      let mean = 0;
      for (const i of ids) mean += rate[i]!;
      mean /= ids.length;
      for (const i of ids) this.hold(i, mean < 1 - 1e-6 ? (rate[i]! - mean) / (1 - mean) : 0);
    }
    for (const [i, n] of neurons.entries()) {
      if (n.evidence) continue;
      const r = rate[i]!;
      this.hold(i, n.role === 'self' ? Math.abs(r) * 1000 / Math.max(1, dtMs) / (FULL[n.axis ?? ''] ?? 1) : 1 - Math.exp(-Math.max(0, r)));
    }
  }

  /** One screen frame of `dtMs`: the peaks since the last frame, else the decay. */
  frame (dtMs: number): void {
    const k = Math.exp(-dtMs / DECAY_MS);
    for (let i = 0; i < this.shown.length; i++) {
      this.shown[i] = Math.max(this.peak[i]!, this.level[i]!, this.shown[i]! * k);
      this.peak[i] = 0;
    }
  }

  private hold (i: number, g: number): void {
    const v = Math.min(1, Math.max(0, g));
    this.level[i] = v;
    this.peak[i] = Math.max(this.peak[i]!, v);
  }

}
