export type TPoint = [number, number];

/** 3x3 homography as 9 numbers, row-major, h[8] = 1. */
export type THomography = number[];

/** Solve the homography mapping four source points onto four destination points (DLT, Gaussian elimination). */
export function computeHomography (src: readonly TPoint[], dst: readonly TPoint[]): THomography {
  const A: number[][] = [];
  for (let k = 0; k < 4; k++) {
    const s = src[k], d = dst[k];
    if (!s || !d) throw new Error('four point pairs needed');
    const [x, y] = s, [u, v] = d;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  const n = 8;
  const get = (r: number, c: number): number => A[r]?.[c] ?? 0;
  const set = (r: number, c: number, value: number): void => {
    const row = A[r];
    if (row) row[c] = value;
  };
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(get(r, c)) > Math.abs(get(p, c))) p = r;
    const rc = A[c], rp = A[p];
    if (rc && rp) {
      A[c] = rp;
      A[p] = rc;
    }
    if (Math.abs(get(c, c)) < 1e-12) throw new Error('degenerate calibration points');
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = get(r, c) / get(c, c);
      for (let k = c; k <= n; k++) set(r, k, get(r, k) - f * get(c, k));
    }
  }
  const h = A.map((row, i) => (row[n] ?? 0) / (row[i] ?? 1));
  h.push(1);
  return h;
}

export function applyHomography (h: THomography, [x, y]: TPoint): TPoint {
  const v = (i: number): number => h[i] ?? 0;
  const d = v(6) * x + v(7) * y + v(8);
  return [(v(0) * x + v(1) * y + v(2)) / d, (v(3) * x + v(4) * y + v(5)) / d];
}
