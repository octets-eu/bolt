// Every frame as evidence by its rung's own profile: how often a frame of
// that channel arrives per second the sender spends in each of 8 sectors
// about the nose, measured over the 18 runs of 2026-10 (replay.mjs
// --senses, frames divided by exposure). A frame adds the log of its
// rung's profile over its mean to a map of bearings, shifted against the
// Bolt's turn; a flat rung (ch2, ch3, strengths 8 and 16) adds about
// nothing, a weak one (ch4, strength 1 of the short ladder, heard 7 to 10
// times more often ahead than behind) adds much. Corner reads the same
// way by their corner's profile. The frames that did not arrive count
// too: the sender's schedule is one frame every 200 ms, the rungs of a
// ladder in order, so the slots between two heard frames are known and
// each missed slot adds the log of its rung's chance of not being heard,
// by sector, over its mean; without them every heard frame says "ahead"
// (the front receivers hear better) and nothing ever says "behind".
// Nothing is forgotten unless `tauMs` says so. The profiles are fitted
// on the same runs the replay scores, so the score is an upper bound
// until other runs confirm it.
//
// Direction is the peak bin; confidence is the peak's share of the map's
// mass after softmax, 1/36 for flat, 1 for one bin.

const N = 36, STEP_MS = 25, EPS = 0.5;
const SECTORS = [0, 45, 90, 135, 180, 225, 270, 315];
// seconds of exposure per sector and frames heard, the 18 runs
const EXPOSURE = [3016, 3852, 5328, 5558, 6818, 3293, 3399, 2583].map((n) => n / 20);
const FRAMES = {
  0: [62, 88, 40, 79, 87, 72, 27, 41], 1: [128, 142, 104, 153, 115, 108, 66, 78], 2: [177, 208, 212, 292, 236, 149, 129, 144],
  3: [233, 294, 363, 371, 301, 204, 235, 198], 4: [42, 27, 0, 13, 9, 28, 17, 51], 5: [85, 61, 9, 37, 47, 53, 40, 112], 6: [107, 106, 32, 79, 89, 101, 60, 142],
};
const CORNERS = { FL: [33, 10, 9, 19, 6, 5, 26, 57], FR: [55, 46, 40, 10, 1, 8, 10, 26], BR: [5, 5, 37, 85, 54, 2, 0, 6], BL: [4, 10, 22, 37, 55, 32, 26, 4] };
const LADDERS = [[0, 1, 2, 3], [4, 5, 6]];   // channels in sending order, communication.ts
const SLOT_MS = 200;
/** `tauCm`: the evidence ages with the locator's travel, not with time; what was heard a metre ago points where the sender was from there. */
const DEFAULTS = { tauMs: Infinity, tauCm: Infinity, wFrame: 1, wMiss: 1, wCorner: 1, temperature: 1 };

const mod360 = (a) => ((a % 360) + 360) % 360;

/** Log-likelihood over the 36 bins from values per sector: log of the value over its mean, interpolated between sector centres. */
function profile (values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const ll = values.map((r) => Math.log(r / mean));
  const out = new Float64Array(N);
  for (let j = 0; j < N; j++) {
    const a = j * 360 / N, pos = a / 45, k = Math.floor(pos), f = pos - k;
    out[j] = ll[k % 8] * (1 - f) + ll[(k + 1) % 8] * f;
  }
  return out;
}

export function bayes (params = {}) {
  const p = { ...DEFAULTS, ...params };
  const rate = (counts) => counts.map((c, i) => (c + EPS) / EXPOSURE[i]);                       // frames per second of exposure
  const heardP = (counts) => rate(counts).map((r) => Math.min(0.98, r * SLOT_MS * 4 / 1000));  // chance per slot of the rung, one slot per round of 4
  const frames = Object.fromEntries(Object.entries(FRAMES).map(([c, n]) => [c, profile(rate(n))]));
  const misses = Object.fromEntries(Object.entries(FRAMES).map(([c, n]) => [c, profile(heardP(n).map((q) => 1 - q))]));
  const corners = Object.fromEntries(Object.entries(CORNERS).map(([c, n]) => [c, profile(rate(n))]));
  let map = new Float64Array(N);
  let last = null, lastHeading = 0, lastFrame = null, lastPos = null;
  const add = (prof, w) => { for (let j = 0; j < N; j++) map[j] += w * prof[j]; };
  const shift = (d) => {
    const out = new Float64Array(N), step = 360 / N;
    for (let j = 0; j < N; j++) { const src = mod360(j * step + d) / step, k = Math.floor(src), f = src - k; out[j] = map[k % N] * (1 - f) + map[(k + 1) % N] * f; }
    map = out;
  };
  return {
    step (e) {
      if (e.type === 'frame') {
        if (!frames[e.channel]) return;
        const ladder = LADDERS.find((l) => l.includes(e.channel));
        if (lastFrame && ladder.includes(lastFrame.channel) && e.t - lastFrame.t > SLOT_MS * 1.5) {
          // the slots between the last heard frame and this one, in the ladder's order, were sent and not heard
          const slots = Math.min(ladder.length * 3, Math.round((e.t - lastFrame.t) / SLOT_MS) - 1);
          let k = ladder.indexOf(lastFrame.channel);
          for (let i = 0; i < slots; i++) { k = (k + 1) % ladder.length; add(misses[ladder[k]], p.wMiss); }
        }
        if (!lastFrame || e.t - lastFrame.t > 100) add(frames[e.channel], p.wFrame);   // a second notify of one frame, within 100 ms, is not another frame
        lastFrame = { t: e.t, channel: e.channel };
        return;
      }
      if (e.type === 'read') {
        const names = ['FL', 'FR', 'BR', 'BL'], heard = names.filter((_, i) => e.payload[i] !== 255);
        if (heard.length && heard.length < 4) for (const c of heard) add(corners[c], p.wCorner);
        return;
      }
      if (last === null) { last = e.t; lastHeading = e.heading; return; }
      if (e.t - last < STEP_MS) return;
      const dt = Math.min(250, e.t - last);
      const turned = ((e.heading - lastHeading + 540) % 360) - 180;
      last = e.t; lastHeading = e.heading;
      shift(turned);
      let decay = Number.isFinite(p.tauMs) ? Math.exp(-dt / p.tauMs) : 1;
      if (Number.isFinite(p.tauCm) && lastPos) decay *= Math.exp(-Math.hypot(e.x - lastPos.x, e.y - lastPos.y) / p.tauCm);
      lastPos = { x: e.x, y: e.y };
      if (decay < 1) for (let j = 0; j < N; j++) map[j] *= decay;
    },
    estimate () {
      let peak = 0, max = -Infinity;
      for (let j = 0; j < N; j++) if (map[j] > max) { max = map[j]; peak = j; }
      let sum = 0;
      for (let j = 0; j < N; j++) sum += Math.exp((map[j] - max) / p.temperature);
      return { angle: peak * 360 / N, length: 1 / sum };
    },
  };
}
