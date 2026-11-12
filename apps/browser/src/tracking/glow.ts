// A Bolt in the phone's frame: its lit LEDs are what got brighter against a
// frame of the same scene without them. `glows` takes the two frames as RGBA
// pixels and answers the patches that lit up, largest first, each with its
// centre, its size and its mean colour. Pure: the page feeds it canvas
// pixels, a script the same from a file.
//
// A pixel counts when its strongest channel rose by RISE or more; a patch is
// the pixels that touch, MIN_PIXELS at least. What went dark, a Bolt that
// stood there in the earlier frame, does not count.

export interface Glow { x: number; y: number; n: number; rgb: [number, number, number] }   // centre in frame pixels, pixels, mean colour

const RISE = 60, MIN_PIXELS = 12;

export function glows (now: ArrayLike<number>, before: ArrayLike<number>, width: number, height: number): Glow[] {
  const lit = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < lit.length; i++, p += 4) {
    const rise = Math.max(now[p]! - before[p]!, now[p + 1]! - before[p + 1]!, now[p + 2]! - before[p + 2]!);
    if (rise >= RISE) lit[i] = 1;
  }
  const out: Glow[] = [], stack: number[] = [];
  for (let start = 0; start < lit.length; start++) {
    if (lit[start] !== 1) continue;
    let n = 0, sx = 0, sy = 0, r = 0, g = 0, b = 0;
    lit[start] = 2; stack.push(start);
    while (stack.length) {
      const i = stack.pop()!, x = i % width, y = (i - x) / width;
      n++; sx += x; sy += y; r += now[4 * i]!; g += now[4 * i + 1]!; b += now[4 * i + 2]!;
      for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1]) {
        if (j >= 0 && lit[j] === 1) { lit[j] = 2; stack.push(j); }
      }
    }
    if (n >= MIN_PIXELS) out.push({ x: sx / n, y: sy / n, n, rgb: [Math.round(r / n), Math.round(g / n), Math.round(b / n)] });
  }
  return out.sort((a, b) => b.n - a.n);
}
