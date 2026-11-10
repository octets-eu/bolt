// The ring on the matrix's border: 28 LEDs around the edge, the front row
// (row 7, by the red LED) the nose, angles clockwise off it. Each LED takes
// the ring's rate at its own angle, interpolated between the 16 neurons,
// scaled so the peak is full; brightness is the rate, colour the confidence:
// off with no belief, green at a low vector, red at FULL. Those are the three
// states the phone over the floor tells apart, white-cyan, pink and dark; it
// exposes for the boards, green fills the matrix at 40 and blooms white from
// 80, red does so at a quarter of that (the calibration of 2026-11-08). The palette is one fixed set, black, 7 green
// levels, 8 red levels, stored once before the volleys load the link: the
// 56-byte palette write timed out behind them, every time (2026-11-08). So a
// draw is the frame and a play, and confidence picks the green or the red
// half at RED_FROM; the brightness and the flash are palette indexes.

import type { Color } from '@bolt/core';

/** Vector length that counts as full confidence; to be set from the logs. */
export const FULL = 1.5;
const GREEN_LEVELS = 7, RED_LEVELS = 8, BASE = 0.8, DARK = 0.02, RED_FROM = 0.5;
const GREEN: Color = [0, 40, 6], RED: Color = [14, 0, 0];

/** Index 0 black, 1 to 7 green rising, 8 to 15 red rising. */
export const PALETTE: Color[] = [[0, 0, 0]];
for (let i = 1; i <= GREEN_LEVELS; i++) PALETTE.push(GREEN.map((v) => Math.round(v * i / GREEN_LEVELS)) as unknown as Color);
for (let i = 1; i <= RED_LEVELS; i++) PALETTE.push(RED.map((v) => Math.round(v * i / RED_LEVELS)) as unknown as Color);

/** Border LEDs with their angle off the nose, clockwise, from the picture's row and column. */
const BORDER: { row: number, col: number, angle: number }[] = [];
for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
  if (row > 0 && row < 7 && col > 0 && col < 7) continue;
  const angle = (Math.atan2(col - 3.5, row - 3.5) * 180 / Math.PI + 360) % 360;   // row 7 ahead, col 7 to the right
  BORDER.push({ row, col, angle });
}

/** The ring's rate at `angle`, the neighbours interpolated; neuron j sits at j * 360 / n. */
function rateAt (rates: ArrayLike<number>, angle: number): number {
  const n = rates.length, pos = angle / (360 / n), k = Math.floor(pos), f = pos - k;
  return rates[k % n]! * (1 - f) + rates[(k + 1) % n]! * f;
}

export interface Picture { pixels: number[][]; red: boolean; peak: number }

/** The ring as a matrix picture over PALETTE; `flash` lifts the brightness from BASE to full. */
export function ringPicture (rates: ArrayLike<number>, length: number, flash: boolean): Picture {
  const pixels = Array.from({ length: 8 }, () => new Array<number>(8).fill(0));
  let peak = 0;
  for (let j = 0; j < rates.length; j++) peak = Math.max(peak, rates[j]!);
  const red = length / FULL >= RED_FROM;
  if (peak < DARK) { pixels[3]![3] = 2; return { pixels, red, peak }; }   // nothing believed: a dim green dot
  const base = red ? GREEN_LEVELS : 0, levels = red ? RED_LEVELS : GREEN_LEVELS;
  const scale = (flash ? 1 : BASE) * levels;
  for (const { row, col, angle } of BORDER) {
    const v = rateAt(rates, angle) / peak;
    pixels[row]![col] = v < 0.05 ? 0 : base + Math.max(1, Math.round(v * scale));
  }
  return { pixels, red, peak };
}

/** The ring's local maxima above `min`, in degrees off the nose: one for a bump, two for an axis. */
export function peaks (rates: ArrayLike<number>, min = DARK): number[] {
  const n = rates.length, out: number[] = [];
  for (let j = 0; j < n; j++) {
    const r = rates[j]!;
    if (r >= min && r >= rates[(j + n - 1) % n]! && r > rates[(j + 1) % n]!) out.push(j * 360 / n);
  }
  return out;
}
