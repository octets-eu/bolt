import { opencv } from './changes';
import type { TPoint } from './homography';

/**
 * The paper pads on the floor, 10.5 x 10.5 cm, taped down in three pairs:
 * fixed points in the frame that do not move. On 2026-09-26 the camera's
 * white balance showed the white paper light blue, (116..172, 168..218,
 * 188..247), against the warm wood, (149, 121, 91); white walls and the
 * pillar are bluish too but touch the frame edge, stand upright or are too
 * flat; floor glare and the ball are ragged. See research/rig.md.
 */
export interface IPad {
  /** centre in frame pixels */
  cx: number;
  cy: number;
  /** the four corners in frame pixels, clockwise from the top left */
  corners: TPoint[];
}

/**
 * Bluer than the wood by this much, and this bright in blue. On 2026-09-28
 * the far left pad in dimmer light read (137, 163, 170), blue over red 33,
 * and failed 35 / 15 / 170; the wood beside it read (103, 95, 79), blue
 * under red by 24, so 25 / 10 / 150 keeps a wide gap to it.
 */
const BLUE_OVER_RED = 25, GREEN_OVER_RED = 10, MIN_BLUE = 150;
/** A pad at the far end covers 1000 to 1300 pixels, one near the camera about 23000; a dim far pad loses its edge. */
const MIN_AREA = 700;
/** Flat on the floor seen at a slant: 1.5 to 4.3 times as wide as high on 2026-09-26. */
const MIN_ASPECT = 1.4, MAX_ASPECT = 5;
/**
 * Contour area over its convex hull's: near 1 for a pad however slanted. The
 * bounding box is no measure: the near left pad, slanted, filled 0.63 of it,
 * as much as floor glare.
 */
const MIN_SOLIDITY = 0.9;

/** The pads in an RGBA frame, near to far; null while OpenCV loads. */
export function detectPads (image: ImageData): IPad[] | null {
  const cv = opencv();
  if (!cv) return null;
  const { width: W, height: H, data } = image;
  const mask = new cv.Mat(H, W, cv.CV_8UC1);
  for (let p = 0, i = 0; p < W * H; p++, i += 4) {
    const r = data[i] ?? 0, g = data[i + 1] ?? 0, b = data[i + 2] ?? 0;
    mask.data[p] = b - r > BLUE_OVER_RED && g - r > GREEN_OVER_RED && b > MIN_BLUE ? 255 : 0;
  }
  const contours = new cv.MatVector(), hierarchy = new cv.Mat(), hull = new cv.Mat(), approx = new cv.Mat();
  // the tape across each pad's lower edge splits it; closing joins it again
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
  const pads: IPad[] = [];
  try {
    cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    for (let k = 0; k < contours.size(); k++) {
      const c = contours.get(k);
      const area = cv.contourArea(c), box = cv.boundingRect(c);
      const edge = box.x <= 0 || box.y <= 0 || box.x + box.width >= W || box.y + box.height >= H;
      cv.convexHull(c, hull, false, true);
      const aspect = box.width / box.height, solidity = area / cv.contourArea(hull);
      if (area >= MIN_AREA && !edge && aspect >= MIN_ASPECT && aspect <= MAX_ASPECT && solidity >= MIN_SOLIDITY) {
        const corners = quad(cv, hull, approx);
        if (corners) pads.push({ cx: box.x + box.width / 2, cy: box.y + box.height / 2, corners });
      }
      c.delete();
    }
  } finally {
    mask.delete(); contours.delete(); hierarchy.delete(); hull.delete(); approx.delete(); kernel.delete();
  }
  return pads.sort((a, b) => b.cy - a.cy);
}

/**
 * A pad's convex hull simplified to four corners, clockwise from the top
 * left; null when no tolerance gives four. The hull, not the outline: a
 * frayed edge or the tape can leave the outline with more corners.
 */
function quad (cv: NonNullable<ReturnType<typeof opencv>>, hull: InstanceType<NonNullable<ReturnType<typeof opencv>>['Mat']>, approx: InstanceType<NonNullable<ReturnType<typeof opencv>>['Mat']>): TPoint[] | null {
  const perimeter = cv.arcLength(hull, true);
  let corners: TPoint[] | null = null;
  for (const tolerance of [0.02, 0.04, 0.06, 0.08]) {
    cv.approxPolyDP(hull, approx, tolerance * perimeter, true);
    if (approx.rows !== 4) continue;
    const pts: TPoint[] = [0, 1, 2, 3].map(i => [approx.data32S[i * 2] ?? 0, approx.data32S[i * 2 + 1] ?? 0]);
    const mx = pts.reduce((s, p) => s + p[0], 0) / 4, my = pts.reduce((s, p) => s + p[1], 0) / 4;
    pts.sort((a, b) => Math.atan2(a[1] - my, a[0] - mx) - Math.atan2(b[1] - my, b[0] - mx));
    // clockwise in frame pixels (y down) runs by rising angle; start at the corner up and left
    const first = pts.reduce((best, p, i) => (p[0] + p[1] < (pts[best]![0] + pts[best]![1]) ? i : best), 0);
    corners = [...pts.slice(first), ...pts.slice(0, first)];
    break;
  }
  return corners;
}
