export interface Point { readonly x: number; readonly y: number }

export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }

/** Degrees into [0, 360). */
export function mod360 (degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/** Signed shortest turn from `from` to `to` in degrees, in (-180, 180]. */
export function angleDistance (from: number, to: number): number {
  const d = mod360(to - from);
  return d > 180 ? d - 360 : d;
}

export function distance (a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Heading to drive from `a` to `b` in the locator frame: 0 is +y, 90 is +x. */
export function headingTo (a: Point, b: Point): number {
  return mod360(Math.atan2(a.y - b.y, a.x - b.x) * -180 / Math.PI + 270);
}

/** Circular mean of headings in degrees, or null for an empty list. */
export function meanHeading (headings: readonly number[]): number | null {
  if (headings.length === 0) return null;
  let sx = 0, sy = 0;
  for (const h of headings) {
    sx += Math.cos(h * Math.PI / 180);
    sy += Math.sin(h * Math.PI / 180);
  }
  return mod360(Math.atan2(sy, sx) * 180 / Math.PI);
}
