// The sheet: the floor plan's frame (public/floor-plan.svg, 500 x 700 cm,
// origin upper left, y down), its reference points, and the marks a run
// leaves on it. Pure: no app, no DOM beyond a 2d context, so the plotter
// draws with it in the browser and bench/image.mjs in Node.
//
// The marks, sizes in screen pixels whatever the zoom (`px` is the sheet's
// cm per pixel):
// - position: a small dot in the Bolt's colour, one per locator sample
// - frame: a larger, darker dot where the Bolt stood when it heard a frame
//   of the ladder; filled on the long ladder, a ring on the short
// - read: a larger dot again where a corner read hit, the corners that
//   heard as red quarters, turned with the nose
// - bolt: a disc with a nose, a Bolt on its point

export const SHEET = { width: 500, height: 700 };

/**
 * The reference points on the floor, on the sheet in cm, and the heading a
 * Bolt placed there faces, clockwise from the sheet's top; the plan draws and
 * names them (see its header). By convention a Bolt reset on a point faces
 * away from the room's centre, the midpoint of lf and rg, its nose the red
 * LED. lf and rg on the partition's centre line, back to back; d1, u1 and u2
 * on the line through their midpoint, 1.2 m down and 1.2 and 2 m up from it.
 */
export const points: { [point: string]: { x: number, y: number, heading: number } } = {
  lf: { x: 241,   y: 317.5, heading: 270 },   // faces the left partition end
  rg: { x: 264,   y: 317.5, heading:  90 },   // faces the right partition end
  d1: { x: 252.5, y: 437.5, heading: 180 },
  u1: { x: 252.5, y: 197.5, heading:   0 },
  u2: { x: 252.5, y: 117.5, heading:   0 },
};

/**
 * A locator offset as a sheet offset, for a Bolt that faced `heading` at its
 * reset, and a sheet offset as a locator offset: the same turn both ways,
 * since it holds the mirror between the locator's y to the front and the
 * sheet's y down.
 */
export function turn (heading: number, x: number, y: number): { x: number, y: number } {
  const c = Math.cos(heading * Math.PI / 180), s = Math.sin(heading * Math.PI / 180);
  return { x: x * c + y * s, y: x * s - y * c };
}

/** The corner receivers in the order a read replies, with their angles off the nose. */
export const CORNERS = [-45, 45, 135, -135];   // FL, FR, BR, BL

type Ctx = CanvasRenderingContext2D;
const DARK = 'rgba(0, 0, 0, 0.45)';   // over a Bolt's colour: the darker shade of the frames and reads
const disc = (ctx: Ctx, x: number, y: number, r: number): void => { ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); };

export const mark = {

  position (ctx: Ctx, x: number, y: number, color: string, px: number): void {
    disc(ctx, x, y, 1.2 * px);
    ctx.fillStyle = color;
    ctx.fill();
  },

  frame (ctx: Ctx, x: number, y: number, color: string, short: boolean, px: number): void {
    disc(ctx, x, y, 3 * px);
    ctx.lineWidth = 1.4 * px;
    for (const style of [color, DARK]) {
      if (short) { ctx.strokeStyle = style; ctx.stroke(); } else { ctx.fillStyle = style; ctx.fill(); }
    }
  },

  /** `heading`: the nose on the sheet, clockwise from its top; `heard`: per corner of CORNERS, whether it heard. */
  read (ctx: Ctx, x: number, y: number, heading: number, heard: boolean[], color: string, px: number): void {
    const r = 6 * px;
    disc(ctx, x, y, r);
    ctx.fillStyle = color; ctx.fill();
    ctx.fillStyle = DARK; ctx.fill();
    ctx.fillStyle = 'red';
    CORNERS.forEach((corner, i) => {
      if (!heard[i]) return;
      const a = (heading + corner - 90) * Math.PI / 180;   // the canvas counts from +x, the sheet from its top
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, r, a - Math.PI / 4, a + Math.PI / 4);
      ctx.closePath();
      ctx.fill();
    });
  },

  /** A disc and a nose the way the Bolt faces, from half the radius to twice it; no nose without a heading. */
  bolt (ctx: Ctx, x: number, y: number, heading: number | null, color: string, px: number): void {
    const r = 8 * px;
    disc(ctx, x, y, r);
    ctx.fillStyle = color;
    ctx.fill();
    if (heading === null) return;
    const a = heading * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a);
    ctx.beginPath();
    ctx.moveTo(x + dx * r / 2, y + dy * r / 2);
    ctx.lineTo(x + dx * r * 2, y + dy * r * 2);
    ctx.lineWidth = 3 * px;
    ctx.strokeStyle = color;
    ctx.stroke();
  },

};
