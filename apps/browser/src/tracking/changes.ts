import cvModule from '@techstark/opencv-js';

type CV = typeof cvModule;
type Mat = InstanceType<CV['Mat']>;

/** OpenCV once its WebAssembly runtime is up; null while it loads. */
let cv: CV | null = null;

void (async () => {
  if (cvModule instanceof Promise) {
    cv = await cvModule;
    return;
  }
  // the runtime may already be up when this module runs, then the callback never fires
  if (!(cvModule as CV & { Mat?: unknown }).Mat) await new Promise<void>((resolve) => { cvModule.onRuntimeInitialized = () => resolve(); });
  cv = cvModule;
})();

/**
 * Working resolution, and the difference in the strongest colour channel,
 * of 255, that counts as changed. Tested 2026-09-23 on five frames against
 * one empty frame: the ball was the only ball-shaped region on the floor and
 * on the mat, in frames taken up to 40 minutes before the reference, in 5 to
 * 11 ms; older frames added strips along the mat edges and on sunlit floor.
 */
const SCALE = 0.5, THRESHOLD = 40;

/** The empty scene at working resolution. */
let reference: Mat | null = null;

export interface IChange {
  /** centre, size and area of a changed region, in frame pixels */
  cx: number;
  cy: number;
  w: number;
  h: number;
  area: number;
}

function shrink (image: ImageData): Mat {
  const full = cv!.matFromImageData(image);
  const small = new cv!.Mat();
  cv!.resize(full, small, new cv!.Size(0, 0), SCALE, SCALE, cv!.INTER_AREA);
  full.delete();
  return small;
}

/** Keep `image` as the empty scene; false while OpenCV loads. */
export function setReference (image: ImageData): boolean {
  if (!cv) return false;
  reference?.delete();
  reference = shrink(image);
  return true;
}

export function hasReference (): boolean {
  return reference !== null;
}

/**
 * Regions of `image` that differ from the empty scene: the per-pixel
 * difference in the strongest channel, blurred, over THRESHOLD, specks
 * opened away. Null without a reference, or when the frame size changed,
 * which drops the reference.
 */
export function changes (image: ImageData): IChange[] | null {
  if (!cv || !reference) return null;
  if (reference.cols !== Math.round(image.width * SCALE) || reference.rows !== Math.round(image.height * SCALE)) {
    reference.delete();
    reference = null;
    return null;
  }
  const frame = shrink(image);
  const diff = new cv.Mat(), channels = new cv.MatVector(), strongest = new cv.Mat(), contours = new cv.MatVector(), hierarchy = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
  try {
    cv.absdiff(frame, reference, diff);
    cv.split(diff, channels);
    const r = channels.get(0), g = channels.get(1), b = channels.get(2);
    cv.max(r, g, strongest);
    cv.max(strongest, b, strongest);
    r.delete();
    g.delete();
    b.delete();
    cv.GaussianBlur(strongest, strongest, new cv.Size(5, 5), 0);
    cv.threshold(strongest, strongest, THRESHOLD, 255, cv.THRESH_BINARY);
    cv.morphologyEx(strongest, strongest, cv.MORPH_OPEN, kernel);
    cv.findContours(strongest, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    const out: IChange[] = [];
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const area = cv.contourArea(c) / SCALE / SCALE;
      const box = cv.boundingRect(c);
      c.delete();
      out.push({ cx: (box.x + box.width / 2) / SCALE, cy: (box.y + box.height / 2) / SCALE, w: box.width / SCALE, h: box.height / SCALE, area });
    }
    return out;
  } finally {
    [frame, diff, channels, strongest, contours, hierarchy, kernel].forEach(m => m.delete());
  }
}
