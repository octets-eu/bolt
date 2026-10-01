import type { Color } from '../config';

/** 8x8 matrix image, rows top to bottom, 1 = lit. */
export type Image = readonly (readonly number[])[];

export const BLACK: Color = [0, 0, 0];
export const RED: Color = [255, 0, 0];

/** 8x8 matrix images, rows top to bottom, 1 = lit. */
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

