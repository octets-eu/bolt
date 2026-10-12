import type { Color } from '../config';

/** 8x8 matrix image, row 0 at the back (white LED); a pixel indexes the palette: 0 dark, 1 the colour, 2 white. */
export type Image = readonly (readonly number[])[];

export const BLACK: Color = [0, 0, 0];
export const RED: Color = [255, 0, 0];
export const WHITE: Color = [255, 255, 255];

/** The pictures drawn by hand; `IMAGES` adds the ones computed from them. */
const PICTURES = {

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

  /** '?' pointing front: a sweep found no direction. */
  'lost': [
    [0,0,0,1,1,0,0,0],
    [0,0,0,0,0,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,0,1,1,0,0],
    [0,0,0,0,0,1,1,0],
    [0,1,1,0,0,1,1,0],
    [0,0,1,1,1,1,0,0],
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

const cells = [0, 1, 2, 3, 4, 5, 6, 7];

/** `image` turned a quarter clockwise seen from above: what pointed front points right. */
function rotated (image: Image): Image {
  return cells.map(row => cells.map(col => image[7 - col]?.[row] ?? 0));
}

/** `image` with every other pixel dropped, a checkerboard: the same shape, thinner. */
function sparse (image: Image): Image {
  return image.map((line, row) => line.map((pixel, col) => (row + col) % 2 ? 0 : pixel));
}

const sending = [PICTURES['infra-listen'], rotated(PICTURES['infra-listen'])];
sending.push(rotated(sending[1]!), rotated(rotated(sending[1]!)));

/** 8x8 matrix images by name, see `Image`; the `-short` ones are the sparse pictures of the short ladder. */
export const IMAGES = {
  ...PICTURES,
  'infra-listen-short': sparse(PICTURES['infra-listen']),
  'tracking-short':     sparse(PICTURES.tracking),
  'sending-0': sending[0]!, 'sending-1': sending[1]!, 'sending-2': sending[2]!, 'sending-3': sending[3]!,
  'sending-short-0': sparse(sending[0]!), 'sending-short-1': sparse(sending[1]!), 'sending-short-2': sparse(sending[2]!), 'sending-short-3': sparse(sending[3]!),
} as const;

export type ImageName = keyof typeof IMAGES;

/** The 'i' turning once in 2 s: what a sender shows, full for the long ladder, sparse for the short. */
export const SENDING: { readonly long: readonly ImageName[]; readonly short: readonly ImageName[] } = {
  long:  ['sending-0', 'sending-1', 'sending-2', 'sending-3'],
  short: ['sending-short-0', 'sending-short-1', 'sending-short-2', 'sending-short-3'],
};
