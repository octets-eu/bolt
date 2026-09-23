/**
 * LED colour classes the tracker can tell apart on the camera. At full
 * brightness every matrix colour clips to white on the sensor; the marker
 * therefore runs below full, at MARKER_LEVEL in tracker.ts, and the level that
 * works depends on the room light. Measured by frame differencing in daylight
 * at level 100: green (105, 178, 198), blue (102, 164, 201), red
 * (160, 164, 187). Green leans cyan and blue leans cyan-white on this camera;
 * the sign of blue minus green separates them. Red renders pink-white and is
 * barely classified, so it is not a usable marker colour. The tests reject
 * the teal mat and its glare (green never 70 above red), the wooden floor
 * (blue well under green) and grey walls (no cast).
 */
export type TColorClass = 'green' | 'blue' | 'red';

export const classify: { [c in TColorClass]: (r: number, g: number, b: number) => boolean } = {
  green: (r, g, b) => g > 200 && g - r >= 70 && Math.abs(g - b) <= 25,
  red:   (r, g, b) => r > 180 && r - g >= 25 && b >= g - 5,
  blue:  (r, g, b) => b > 220 && b - g >= 25 && g - r >= 30,
};

/** Which class an RGB triple, e.g. a Bolt's configured matrix colour, is closest to. */
export function classOf (color: readonly number[]): TColorClass {
  const [r = 0, g = 0, b = 0] = color;
  if (r >= g && r >= b) return 'red';
  if (g >= b) return 'green';
  return 'blue';
}

export interface IBlob {
  cls: TColorClass;
  /** centroid in frame pixels */
  cx: number;
  cy: number;
  /** pixel count */
  n: number;
}

export interface IRegion { x0: number, y0: number, x1: number, y1: number }

/** All channels above this count as clipped white. */
const CLIPPED = 220;

/**
 * Connected components per colour class inside a region of the frame. A
 * matrix tilted toward the camera clips to white in the middle and keeps its
 * colour only at the fringe (2026-09-23: 591 white and 664 green pixels, the
 * green in two blobs around the core); clipped white joins the class of the
 * coloured pixels it touches, so the core and its fringe are one blob again.
 * White glare with no coloured fringe stays out.
 */
export function findColorBlobs (data: Uint8ClampedArray, W: number, region: IRegion, classes: TColorClass[], minSize = 8): IBlob[] {
  const rw = region.x1 - region.x0, rh = region.y1 - region.y0;
  if (rw <= 0 || rh <= 0) return [];
  const label = new Uint8Array(rw * rh);
  const white = new Uint8Array(rw * rh);
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    const i = ((y + region.y0) * W + x + region.x0) * 4;
    const r = data[i] ?? 0, g = data[i + 1] ?? 0, b = data[i + 2] ?? 0;
    if (r > CLIPPED && g > CLIPPED && b > CLIPPED) {
      white[y * rw + x] = 1;
      continue;
    }
    for (let k = 0; k < classes.length; k++) {
      const c = classes[k];
      if (c && classify[c](r, g, b)) {
        label[y * rw + x] = k + 1;
        break;
      }
    }
  }
  // flood the class of every coloured pixel into the clipped white it touches
  const queue: number[] = [];
  for (let i = 0; i < rw * rh; i++) if (label[i]) queue.push(i);
  while (queue.length) {
    const p = queue.pop()!;
    const x = p % rw;
    for (const q of [p - 1, p + 1, p - rw, p + rw]) {
      if (q < 0 || q >= rw * rh || !white[q] || label[q]) continue;
      if (Math.abs((q % rw) - x) > 1) continue;
      label[q] = label[p] ?? 0;
      queue.push(q);
    }
  }
  const seen = new Uint8Array(rw * rh);
  const blobs: IBlob[] = [];
  for (let i = 0; i < rw * rh; i++) {
    if (!label[i] || seen[i]) continue;
    const cls = label[i] ?? 0;
    const stack = [i];
    seen[i] = 1;
    let n = 0, sx = 0, sy = 0;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % rw, y = (p - x) / rw;
      n++;
      sx += x;
      sy += y;
      for (const q of [p - 1, p + 1, p - rw, p + rw]) {
        if (q < 0 || q >= rw * rh || seen[q] || label[q] !== cls) continue;
        if (Math.abs((q % rw) - x) > 1) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    const c = classes[cls - 1];
    if (c && n >= minSize) blobs.push({ cls: c, cx: sx / n + region.x0, cy: sy / n + region.y0, n });
  }
  return blobs.sort((a, b) => b.n - a.n);
}

const CLASSES: TColorClass[] = ['green', 'blue', 'red'];

/** Pixels of each colour class in the upper half of a circle of an RGBA frame `W` by `H`, where a ball's matrix shows. */
export function glowIn (data: Uint8ClampedArray, W: number, H: number, cx: number, cy: number, r: number): { [c in TColorClass]: number } {
  const n = { green: 0, blue: 0, red: 0 };
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(H - 1, Math.round(cy)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, Math.ceil(cx + r)); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const i = (y * W + x) * 4;
      const red = data[i] ?? 0, green = data[i + 1] ?? 0, blue = data[i + 2] ?? 0;
      for (const c of CLASSES) {
        if (classify[c](red, green, blue)) {
          n[c]++;
          break;
        }
      }
    }
  }
  return n;
}
