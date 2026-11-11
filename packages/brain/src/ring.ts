// The ring attractor's own mechanics, beside the weights in circuit.json.
//
// The ring is egocentric: neuron j holds the belief that the sender lies at
// its `angle` off the nose, clockwise. When the Bolt turns by d degrees, the
// world turns by -d around it, so the activity is shifted by d against the
// turn, read off the yaw: the fly's compass shift, done exactly instead of by
// rotation neurons.
//
// What it does, by the weights (build/build-circuit.ts): one corner read is held about
// 5 s, a full bump fades over 10 s; a bump at nose and tail together, the axis a carrier
// frame names, has no vector and fades with its input unless a corner read or the gradient tips it
// to one side, after which the one-bump mode holds it. No input, no bump:
// the motor neurons see no vector and search.

/** Shift ring rates `r` (angles evenly spaced) by `d` degrees against a turn of `d` clockwise. */
export function shiftRing (r: Float64Array, d: number): Float64Array {
  const n = r.length, step = 360 / n;
  const out = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const src = ((j * step + d) % 360 + 360) % 360 / step;   // where the activity now at j sat before the turn
    const k = Math.floor(src), f = src - k;
    out[j] = r[k % n]! * (1 - f) + r[(k + 1) % n]! * f;
  }
  return out;
}

/** The population vector: direction off the nose in degrees and length, the ring's confidence. */
export function ringVector (r: ArrayLike<number>): { angle: number; length: number } {
  const n = r.length;
  let x = 0, y = 0;
  for (let j = 0; j < n; j++) { const a = 2 * Math.PI * j / n; x += r[j]! * Math.cos(a); y += r[j]! * Math.sin(a); }
  return { angle: Math.atan2(y, x) * 180 / Math.PI, length: Math.hypot(x, y) };
}
