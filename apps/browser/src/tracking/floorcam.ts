// The phone over the floor as a measuring camera: a sheet point (sheet.ts,
// cm) to its place in the phone's frame and back. The model is a lens looking
// straight down with one radial term: the sheet point under the lens,
// `under`, lands at `at` in the frame; from there a floor offset is turned by
// `rot`, scaled by `scale`, and pulled in by `k1` times its squared length,
// the wide lens's barrel. Frame places are fractions of the frame's width on
// both axes, so one set of numbers serves every stream size.
//
// POSE is the pose the mount is aligned to: the camera view draws the
// reference points and the partition's ends through it over the picture, and
// the phone is turned until the floor's marks sit under the drawn ones.

import { points } from '../components/plotter/sheet';

export const POSE = {
  under: { x: 252.5, y: 317.5 },   // the middle of the opening, between lf and rg
  at:    { u: 0.50116, v: 0.63608 },   // the partition's two ends lie mirrored about the frame's middle
  rot:   2.24,                     // deg, the sheet's top against the frame's
  scale: 0.00302,                  // frame widths per cm at the middle
  k1:    -1.5143e-6,               // per cm squared
};

/**
 * A Bolt's lit matrix sits on top of the ball, above the floor, so the camera
 * sees it further from the point under the lens than the Bolt stands: its
 * floor point is the glow's sheet point drawn in toward `under` by this.
 */
export const LIFT = 0.972;

/** A sheet point, cm, in the frame: fractions of the frame's width, u right, v down. */
export function toFrame (x: number, y: number, pose = POSE): { u: number, v: number } {
  const a = pose.rot * Math.PI / 180, dx = x - pose.under.x, dy = y - pose.under.y;
  const rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a);
  const k = pose.scale * (1 + pose.k1 * (rx * rx + ry * ry));
  return { u: pose.at.u + k * rx, v: pose.at.v + k * ry };
}

/** A frame point, fractions of the width, on the sheet, cm: `toFrame` turned round, the radial term by iteration. */
export function toSheet (u: number, v: number, pose = POSE): { x: number, y: number } {
  const qx = (u - pose.at.u) / pose.scale, qy = (v - pose.at.v) / pose.scale;
  let rx = qx, ry = qy;
  for (let i = 0; i < 20; i++) { const g = 1 + pose.k1 * (rx * rx + ry * ry); rx = qx / g; ry = qy / g; }
  const a = pose.rot * Math.PI / 180;
  return { x: pose.under.x + rx * Math.cos(a) + ry * Math.sin(a), y: pose.under.y - rx * Math.sin(a) + ry * Math.cos(a) };
}

/** Where a Bolt stands on the sheet, cm, from its lit matrix's place in the frame (glow.ts), fractions of the width. */
export function boltOnSheet (u: number, v: number, pose = POSE): { x: number, y: number } {
  const s = toSheet(u, v, pose);
  return { x: pose.under.x + (s.x - pose.under.x) * LIFT, y: pose.under.y + (s.y - pose.under.y) * LIFT };
}

/** What the camera view draws for the alignment: the reference points, and the partition's two end faces at floor level. */
export const MARKS = {
  points,
  ends: [[{ x: 181, y: 308 }, { x: 181, y: 327 }], [{ x: 324, y: 308 }, { x: 324, y: 327 }]],
};
