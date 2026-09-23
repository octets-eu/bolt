import type { Color } from '../config';

/** 8x8 matrix image, rows top to bottom, 1 = lit. */
export type Image = readonly (readonly number[])[];

export const BLACK: Color = [0, 0, 0];

/** 8x8 matrix images, rows top to bottom, 1 = lit. */
export const IMAGES = {

  /** Chevron pointing at the front of the Bolt: the heading marker after calibration. */
  chevron: [
    [0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0],
    [1,0,0,0,0,0,0,1],
    [0,1,0,0,0,0,1,0],
    [0,0,1,0,0,1,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
  ] as Image,

} as const;
