// The ring plus distance: the direction belief as the 36-bin ring of
// replay-bayes.mjs, and a distance belief of 10 bands of 20 cm, fed by the
// levels' measured range profiles (replay.mjs --senses: strength 2 of the
// long ladder arrives under 80 cm, 4 under 140, 16 everywhere and most when
// far). The profiles go by physical strength, not by channel: the short
// ladder is only ever sent when the brain believes it is near, so its
// channels were only recorded near, and taken by channel they said 20 cm
// for a frame heard at a metre, the believed distance running at half the
// truth (path test, 2026-11-08). So ch6 (strength 4) takes ch1's profile,
// ch5 (2) ch0's, ch4 (1, the short ladder's own) ch0's one band nearer. Nothing is
// forgotten; instead the ring is carried along when the Bolt moves: a step
// of the locator turns every bearing by the parallax the believed distance
// gives, and shortens or lengthens the distance by the step's component
// along the believed bearing. So a good frame stays good after a move, and
// a pass puts the mass behind by itself. 46 neurons in the brain's terms,
// the two shifts computed from the locator as the ring's turn is from the
// yaw. The readout is the ring's peak; the confidence the peak's share.

import { bayes } from './replay-bayes.mjs';

const BANDS = 10, BAND_CM = 20, EPS = 0.3;
// frames per second of exposure per band, the senses table of 2026-11-08 (18 runs plus the marked run)
const EXPOSURE_S = [4, 125, 245, 219, 248, 164, 168, 202, 105, 78];
const RANGE = {
  0: [0, 0.77, 0.82, 0.64, 0.20, 0.07, 0.01, 0, 0, 0], 1: [0, 0.82, 1.06, 0.97, 0.59, 0.32, 0.45, 0.19, 0.14, 0.01],
  2: [0, 0.72, 1.15, 1.16, 0.87, 0.63, 0.98, 1.17, 1.02, 0.93], 3: [0, 0.67, 1.15, 1.21, 1.00, 0.86, 1.51, 1.92, 1.76, 2.10],
};
RANGE[6] = RANGE[1];                                 // strength 4
RANGE[5] = RANGE[0];                                 // strength 2
RANGE[4] = [RANGE[0][1], ...RANGE[0].slice(2), 0];   // strength 1: strength 2's profile one band nearer
const DEFAULTS = { wCorner: 3, wDist: 1, parallax: 1, temperature: 1 };
const mod360 = (a) => ((a % 360) + 360) % 360;

/** Log of the rate over its mean per band, the first band's four seconds of exposure given little weight through EPS. */
function distProfile (rates) {
  const r = rates.map((v, i) => v + EPS / Math.max(1, EXPOSURE_S[i] / 50));
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  return r.map((v) => Math.log(v / mean));
}

export function ringdist (params = {}) {
  const p = { ...DEFAULTS, ...params };
  const ring = bayes({ wCorner: p.wCorner, temperature: p.temperature });   // the ring: bearings, never forgetting, shifted by the yaw inside
  const profiles = Object.fromEntries(Object.entries(RANGE).map(([c, r]) => [c, distProfile(r)]));
  const dist = new Float64Array(BANDS);   // log-evidence per band
  let lastPos = null, lastHeading = null;
  const believed = () => {   // the expected distance, cm, from the softmax over the bands
    let max = -Infinity; for (const v of dist) max = Math.max(max, v);
    let sum = 0, acc = 0;
    for (let i = 0; i < BANDS; i++) { const w = Math.exp(dist[i] - max); sum += w; acc += w * (i + 0.5) * BAND_CM; }
    return acc / sum;
  };
  return {
    step (e) {
      if (e.type === 'frame') {
        if (profiles[e.channel]) for (let i = 0; i < BANDS; i++) dist[i] += p.wDist * profiles[e.channel][i];
        ring.step(e);
        return;
      }
      if (e.type === 'read') { ring.step(e); return; }
      // motion: the ring's own yaw shift happens in ring.step; here the translation, as the parallax of the believed distance
      if (lastPos && p.parallax) {
        const dx = e.x - lastPos.x, dy = e.y - lastPos.y;   // locator frame: +y the reset's nose, +x its right
        const stepCm = Math.hypot(dx, dy);
        if (stepCm > 0.2) {
          const d = believed();
          // the step in the Bolt's own frame of the last sample: forward along its heading, right across it
          const h = (lastHeading ?? e.heading) * Math.PI / 180;
          const fwd = dx * Math.sin(h) + dy * Math.cos(h), right = dx * Math.cos(h) - dy * Math.sin(h);
          // a point at bearing b and distance d, after the step: new relative position
          const est = ring.estimate();
          const b = est.angle * Math.PI / 180;
          const px = d * Math.sin(b) - right, py = d * Math.cos(b) - fwd;
          const turned = mod360(Math.atan2(px, py) * 180 / Math.PI) - mod360(est.angle);
          ring.shiftBy(((turned + 540) % 360) - 180);
          // the distance: shortened by what the step took off along the bearing
          const dNew = Math.hypot(px, py), shift = (dNew - d) / BAND_CM;
          if (Math.abs(shift) > 0.02) {
            const out = new Float64Array(BANDS);
            for (let i = 0; i < BANDS; i++) { const src = i - shift, k = Math.floor(src), f = src - k; const a = dist[Math.min(BANDS - 1, Math.max(0, k))], c = dist[Math.min(BANDS - 1, Math.max(0, k + 1))]; out[i] = a * (1 - f) + c * f; }
            dist.set(out);
          }
        }
      }
      lastPos = { x: e.x, y: e.y }; lastHeading = e.heading;
      ring.step(e);
    },
    estimate () { const est = ring.estimate(); return { ...est, distance: believed() }; },
    rates () { return ring.rates(); },
    debug () { return `d ${believed().toFixed(0)} cm`; },
  };
}
