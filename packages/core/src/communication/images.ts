import type { Color } from '../config';

/** 8x8 matrix image, row 0 at the back (white LED); a pixel indexes the palette: 0 dark, 1 the colour, 2 white. */
export type Image = readonly (readonly number[])[];

export const BLACK: Color = [0, 0, 0];
export const RED: Color = [255, 0, 0];
export const WHITE: Color = [255, 255, 255];

/** 8x8 matrix images by name, see `Image`. */
export const IMAGES = {

  /** The Bolt's colour with a dark 2x2 centre: what a Bolt shows when idle. */
  'resting': [
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],
    [1,1,1,0,0,1,1,1],
    [1,1,1,0,0,1,1,1],
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],
  ] as Image,

  /** Chevron pointing at the front of the Bolt: the heading marker after calibration. */
  'cruising': [
    [0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0],
    [1,0,0,0,0,0,0,1],
    [0,1,0,0,0,0,1,0],
    [0,0,1,0,0,1,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
  ] as Image,

  /** Simple 'i' pointing front, when bolt wait for IR event. */
  'infra-listen': [
    [0,0,1,1,1,1,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,0,0,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
  ] as Image,

  /** '!' pointing front, flashed on a collision or gyro max. */
  'collision': [
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,0,0,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
  ] as Image,

  /** White corners, laid over the other images while a target is locked. */
  'locked': [
    [2,0,0,0,0,0,0,2],
    [0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0],
    [2,0,0,0,0,0,0,2],
  ] as Image,

  /** Upright cross, blinks with 'infra-listen' while the bolt finds the direction of an IR sender. */
  'tracking': [
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,0,0,0,0,0],
    [1,1,0,1,1,0,1,1],
    [1,1,0,1,1,0,1,1],
    [0,0,0,0,0,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
  ] as Image,
} as const;

export type ImageName = keyof typeof IMAGES;
