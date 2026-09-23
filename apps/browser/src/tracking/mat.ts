import { TPoint } from './homography';

/**
 * The yoga mat's teal by hue and saturation, so it holds from a bright
 * afternoon to a dim evening: hue between cyan and blue, clearly saturated,
 * not black. Blue-tinted walls are too pale, the wooden floor is orange.
 * Saturation, not hue, keeps out cool-lit white and grey: on 2026-09-23 the
 * mat measured 0.89 to 1.00, newspapers, wall and pillar at the same hue
 * 0.37 to 0.57, and at a limit of 0.3 they merged with the mat's far rows.
 */
export function isMatBlue (r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max < 40) return false;
  const sat = (max - min) / max;
  if (sat < 0.7) return false;
  const d = max - min;
  let hue: number;
  if (max === r) hue = 60 * (((g - b) / d) % 6);
  else if (max === g) hue = 60 * ((b - r) / d + 2);
  else hue = 60 * ((r - g) / d + 4);
  if (hue < 0) hue += 360;
  return hue >= 170 && hue <= 215;
}

function fitRobust (pts: TPoint[]): { a: number, b: number } {
  let use = pts, f = { a: 0, b: 0 };
  for (let it = 0; it < 4; it++) {
    const n = use.length;
    const sx = use.reduce((s, p) => s + p[0], 0), sy = use.reduce((s, p) => s + p[1], 0);
    const sxx = use.reduce((s, p) => s + p[0] * p[0], 0), sxy = use.reduce((s, p) => s + p[0] * p[1], 0);
    const a = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    f = { a, b: (sy - a * sx) / n };
    const res = pts.map(p => Math.abs(p[1] - (f.a * p[0] + f.b)));
    const sorted = [...res].sort((x, y) => x - y);
    const med = sorted[Math.floor(sorted.length / 2)] ?? 0;
    use = pts.filter((_p, i) => (res[i] ?? Infinity) <= Math.max(3, 2.5 * med));
  }
  return f;
}

/**
 * Find the mat's four corners in a frame: per row the outermost teal runs,
 * the two long edges fitted as lines with outlier rejection (cable, glare),
 * corners where those lines meet the first and last mat row.
 * Returns corners in frame pixels: bottom-left, bottom-right, top-right, top-left.
 */
export function detectMatCorners (data: Uint8ClampedArray, W: number, H: number, scale: number): TPoint[] | null {
  // teal runs per row
  const runs: [number, number][][] = [];
  for (let y = 0; y < H; y++) {
    const row: [number, number][] = [];
    let cur = -1;
    for (let x = 0; x <= W; x++) {
      const i = (y * W + x) * 4;
      const isBlue = x < W && isMatBlue(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
      if (isBlue && cur < 0) cur = x;
      if (!isBlue && cur >= 0) {
        if (x - cur >= 12) row.push([cur, x - 1]);
        cur = -1;
      }
    }
    runs.push(row);
  }
  // seed: the single widest run in the frame is on the mat
  let seedY = -1, seed: [number, number] | null = null;
  runs.forEach((row, y) => row.forEach(r => {
    if (!seed || r[1] - r[0] > seed[1] - seed[0]) {
      seed = r;
      seedY = y;
    }
  }));
  if (!seed || seed[1] - seed[0] < 60) return null;
  // grow up and down, each row keeping the run that overlaps the previous row's run the most
  const rows: { y: number, l: number, r: number }[] = [];
  const pick = (y: number, prev: [number, number]): [number, number] | null => {
    let best: [number, number] | null = null, bestOverlap = 0;
    for (const r of runs[y] ?? []) {
      const overlap = Math.min(r[1], prev[1]) - Math.max(r[0], prev[0]);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = r;
      }
    }
    return bestOverlap >= 8 ? best : null;
  };
  let prev: [number, number] = seed;
  for (let y = seedY; y >= 0; y--) {
    const r = y === seedY ? seed : pick(y, prev);
    if (!r) break;
    rows.unshift({ y, l: r[0], r: r[1] });
    prev = r;
  }
  prev = seed;
  for (let y = seedY + 1; y < H; y++) {
    const r = pick(y, prev);
    if (!r) break;
    rows.push({ y, l: r[0], r: r[1] });
    prev = r;
  }
  if (rows.length < 30) return null;
  const mid = rows.slice(2, -2);
  const L = fitRobust(mid.map(r => [r.y, r.l]));
  const R = fitRobust(mid.map(r => [r.y, r.r]));
  const firstRow = rows[0], lastRow = rows[rows.length - 1];
  if (!firstRow || !lastRow) return null;
  const yT = firstRow.y, yB = lastRow.y;
  // a mat seen end-on spans most of the frame's height and is wider near the camera
  if (yB - yT < H * 0.4) return null;
  if ((R.a * yB + R.b) - (L.a * yB + L.b) <= (R.a * yT + R.b) - (L.a * yT + L.b)) return null;
  const s = scale;
  return [
    [(L.a * yB + L.b) * s, yB * s],
    [(R.a * yB + R.b) * s, yB * s],
    [(R.a * yT + R.b) * s, yT * s],
    [(L.a * yT + L.b) * s, yT * s],
  ];
}
