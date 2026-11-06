// The camera over the floor, for placing Bolts: the forwarder's text protocol
// (CLAUDE.md, port 7020), a fresh frame as grey pixels, the partition's two
// ends as landmarks, the frame-to-plan similarity, and a Bolt found as the
// blob that lights up between a frame with its matrix dark and one with it lit.
// Coordinates on the plan are the room frame of docs/floor-plan.svg, cm.

import net from 'node:net';
import sharp from 'sharp';

const host = process.env.BRIDGE_HOST ?? '127.0.0.1';
const port = Number(process.env.CAM_PORT ?? 7020);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** One line to the forwarder; resolves with the text reply and the bytes after it. */
export function cam (line) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const s = net.connect(port, host, () => s.write(line + '\n'));
    s.setTimeout(5000, () => { s.destroy(); reject(new Error(`camera: no reply to ${line}`)); });
    s.on('data', (c) => chunks.push(c));
    s.on('error', reject);
    s.on('end', () => {
      const buf = Buffer.concat(chunks);
      const nl = buf.indexOf(10);
      resolve({ text: buf.subarray(0, nl < 0 ? buf.length : nl).toString(), bytes: nl < 0 ? Buffer.alloc(0) : buf.subarray(nl + 1) });
    });
  });
}

/**
 * A frame taken after `since` (ms epoch) plus `settleMs`: { jpeg, gray, w, h, t }.
 * The stream runs about 1.9 s behind the age the forwarder reports (2026-11-04:
 * LEDs switched at t showed from t + 1.9 s in frames of age 20 to 300 ms), so
 * the settle covers that lag.
 */
export async function frameAfter (since = Date.now(), settleMs = 2500) {
  for (let i = 0; i < 60; i++) {
    const r = await cam('frame').catch(() => ({ text: '' }));   // a lost reply is one more try
    if (r.text.startsWith('frame')) {
      const [, size, age] = r.text.split(' ').map(Number);
      const t = Date.now() - age;
      if (t >= since + settleMs && r.bytes.length === size) {
        const { data, info } = await sharp(r.bytes).greyscale().raw().toBuffer({ resolveWithObject: true });
        return { jpeg: r.bytes, gray: data, w: info.width, h: info.height, t };
      }
    }
    await wait(250);
  }
  throw new Error('camera: no fresh frame in 15 s');
}

/**
 * The partition's inner ends in pixels: the white tops of its two parts, the
 * left part ending in window L, the right in window R. An end is the last
 * column whose longest bright run is a bar's width, 30 to 120 px; its point
 * the middle of that run 8 px inside, the edge column being half lit.
 * Windows fit the mount of 2026-11-04.
 */
export function partitionEnds ({ gray, w }) {
  const L = { x0: 150, x1: 480, y0: 600, y1: 860 }, R = { x0: 720, x1: 1050, y0: 600, y1: 860 };
  const end = (win, fromRight) => {
    const vals = [];
    for (let y = win.y0; y < win.y1; y += 2) for (let x = win.x0; x < win.x1; x += 2) vals.push(gray[y * w + x]);
    vals.sort((a, b) => a - b);
    const bright = Math.max(40, vals[Math.floor(vals.length * 0.97)] * 0.5);
    const run = (x) => {
      let best = { top: 0, bottom: -1 }, top = null;
      for (let y = win.y0; y <= win.y1; y++) {
        const on = y < win.y1 && gray[y * w + x] > bright;
        if (on && top === null) top = y;
        if (!on && top !== null) { if (y - 1 - top > best.bottom - best.top) best = { top, bottom: y - 1 }; top = null; }
      }
      return best;
    };
    const xs = fromRight ? range(win.x1 - 1, win.x0 - 1, -1) : range(win.x0, win.x1, 1);
    const found = xs.find((x) => { const r = run(x); return r.bottom - r.top >= 30 && r.bottom - r.top <= 120; });
    if (found === undefined) throw new Error('camera: a partition end not found');
    const r = run(found + (fromRight ? -8 : 8));
    return { x: found, y: (r.top + r.bottom) / 2, top: r.top, bottom: r.bottom };
  };
  return { left: end(L, true), right: end(R, false) };
}

function range (a, b, step) { const r = []; for (let v = a; step > 0 ? v < b : v > b; v += step) r.push(v); return r; }

/** Plan positions of the landmarks, room frame cm (floor-plan.svg header). */
export const PLAN = { left: { x: 151, y: 295 }, right: { x: 294, y: 295 }, halfThickness: 9.5 };

/** The similarity that lays pixel p1 on plan q1 and p2 on q2: { toPlan, toPixel, cmPerPx, deg }. */
export function similarity (p1, p2, q1 = PLAN.left, q2 = PLAN.right) {
  // complex numbers: q = a * p + b
  const dp = { x: p2.x - p1.x, y: p2.y - p1.y }, dq = { x: q2.x - q1.x, y: q2.y - q1.y };
  const n = dp.x * dp.x + dp.y * dp.y;
  const a = { re: (dq.x * dp.x + dq.y * dp.y) / n, im: (dq.y * dp.x - dq.x * dp.y) / n };
  const mul = (z, p) => ({ x: z.re * p.x - z.im * p.y, y: z.re * p.y + z.im * p.x });
  const ap1 = mul(a, p1), b = { x: q1.x - ap1.x, y: q1.y - ap1.y };
  const m2 = a.re * a.re + a.im * a.im, inv = { re: a.re / m2, im: -a.im / m2 };
  return {
    toPlan:  (p) => { const v = mul(a, p); return { x: v.x + b.x, y: v.y + b.y }; },
    toPixel: (q) => mul(inv, { x: q.x - b.x, y: q.y - b.y }),
    cmPerPx: Math.sqrt(m2),
    deg:     Math.atan2(a.im, a.re) * 180 / Math.PI,
  };
}

/**
 * The blob that is brighter in `lit` than in `dark`: the centre of the pixels
 * above half the peak difference within 25 px of the peak, or null when the
 * peak, smoothed over 9 x 9 px, rises less than `minRise` grey levels.
 */
export function litBlob (lit, dark, minRise = 25) {
  const { w, h } = lit, c = 4;
  const cw = Math.floor(w / c), ch = Math.floor(h / c), cells = new Float32Array(cw * ch);
  for (let y = 0; y < ch * c; y++) for (let x = 0; x < cw * c; x++) {
    const i = y * w + x;
    cells[Math.floor(y / c) * cw + Math.floor(x / c)] += lit.gray[i] - dark.gray[i];
  }
  let best = -Infinity, bx = 0, by = 0;
  for (let y = 1; y < ch - 1; y++) for (let x = 1; x < cw - 1; x++) {
    let s = 0;
    for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) s += cells[(y + j) * cw + x + k];
    if (s > best) { best = s; bx = x; by = y; }
  }
  const rise = best / (9 * c * c);
  if (rise < minRise) return { found: false, rise };
  const px = bx * c + c / 2, py = by * c + c / 2;
  let peak = 0;
  for (let y = py - 25; y <= py + 25; y++) for (let x = px - 25; x <= px + 25; x++) peak = Math.max(peak, lit.gray[y * w + x] - dark.gray[y * w + x]);
  let sx = 0, sy = 0, n = 0;
  for (let y = py - 25; y <= py + 25; y++) for (let x = px - 25; x <= px + 25; x++) {
    if (lit.gray[y * w + x] - dark.gray[y * w + x] > peak / 2) { sx += x; sy += y; n++; }
  }
  return { found: true, rise: Math.round(rise), x: sx / n, y: sy / n, n };
}
