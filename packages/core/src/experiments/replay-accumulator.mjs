// An evidence map in place of the ring: the agent's observation layer as it
// is (carrier, corners, misses), its events accumulated over bearing bins
// that are shifted against the Bolt's turn and forget slowly, instead of a
// leaky ring that holds the last input only. What a candidate for the brain's
// memory layer looks like before it is tuned; for replay.mjs.
//
// A carrier frame: the sender is inside the lobe ahead or behind, so lobes
// at 0 and 180 of half-width LOBE_AX gain W_AX. A landed read naming corners:
// each corner's lobe of half-width LOBE_CORNER gains W_CORNER, the one sense
// that tells a side. A standing miss, a round without the carrier: the lobes
// at 0 and 180 lose W_MISS. Everything decays with TAU_MS. Direction is the
// peak bin; confidence is the map's concentration, the resultant length of
// the map taken as weights, 0 for flat or two opposite bumps, 1 for one bin.

import { loadConnectome } from '../brain/connectome/load.mjs';
import { Observation } from '../brain/connectome/observation/observation.mjs';

const STEP_MS = 25;
const DEFAULTS = { n: 36, tauMs: 20000, wAx: 1, wCorner: 3, wMiss: 0.5, lobeAx: 60, lobeCorner: 45 };
const CORNERS = { FL: -45, FR: 45, BR: 135, BL: -135 };

const mod360 = (a) => ((a % 360) + 360) % 360;
/** Raised-cosine lobe centred on `c`, half-width `w`, 1 at the centre, 0 at the edge. */
const lobe = (a, c, w) => { const d = Math.abs((((a - c) % 360) + 540) % 360 - 180); return d >= w ? 0 : 0.5 * (1 + Math.cos(Math.PI * d / w)); };

export function accumulator (params = {}) {
  const p = { ...DEFAULTS, ...params };
  const N = p.n;   // bins; 16 is the ring's resolution
  const connectome = loadConnectome();
  const obs = new Observation({ sensors: { listenInfrared: async () => {} } }, connectome.map.ir);
  let now = 0;
  performance.now = () => now;
  obs.switchedAt = 0;
  let map = new Float64Array(N);
  let last = null, lastHeading = 0;   // the turn is taken here too, for the shift
  const angleOf = (j) => j * 360 / N;
  const add = (centre, w, width) => { for (let j = 0; j < N; j++) map[j] = Math.max(0, map[j] + w * lobe(angleOf(j), centre, width)); };
  const shift = (d) => {   // the world turns by -d around a Bolt that turned by d
    const out = new Float64Array(N), step = 360 / N;
    for (let j = 0; j < N; j++) { const src = mod360(angleOf(j) + d) / step, k = Math.floor(src), f = src - k; out[j] = map[k % N] * (1 - f) + map[(k + 1) % N] * f; }
    map = out;
  };
  return {
    step (e) {
      now = e.t;
      if (e.type === 'frame') { if (obs.channels.has(e.channel)) obs.onNotify(e.channel); return; }
      if (e.type === 'read') { if (e.payload.some((c) => obs.channels.has(c))) { obs.stats.landed++; obs.onRead(e.payload); } return; }
      if (last === null) { last = e.t; lastHeading = e.heading; return; }
      if (e.t - last < STEP_MS) return;
      const dt = Math.min(250, e.t - last);
      const turned = ((e.heading - lastHeading + 540) % 360) - 180;
      last = e.t; lastHeading = e.heading;
      const s = obs.tick(e);
      shift(turned);
      const decay = Math.exp(-dt / p.tauMs);
      for (let j = 0; j < N; j++) map[j] *= decay;
      if (s['frame.carrier']) { add(0, p.wAx, p.lobeAx); add(180, p.wAx, p.lobeAx); }
      if (s['frame.miss'] && s['self.still']) { add(0, -p.wMiss, p.lobeAx); add(180, -p.wMiss, p.lobeAx); }
      for (const [c, a] of Object.entries(CORNERS)) if (s[`corner.${c}`]) add(a, p.wCorner, p.lobeCorner);
    },
    estimate () {
      let peak = 0, sum = 0, x = 0, y = 0;
      for (let j = 0; j < N; j++) { if (map[j] > map[peak]) peak = j; sum += map[j]; const a = angleOf(j) * Math.PI / 180; x += map[j] * Math.cos(a); y += map[j] * Math.sin(a); }
      return { angle: angleOf(peak), length: sum > 0 ? Math.hypot(x, y) / sum : 0 };
    },
  };
}
