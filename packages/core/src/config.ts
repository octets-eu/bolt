import type { QueueOptions } from './protocol/queue';

/** Three bytes, 0..255 each, as the LEDs and the matrix take them. */
export type Color = readonly [number, number, number];

export interface ConfigColors {
  /** CSS colours for the console, the plot, the log and the status box. */
  console:   string;
  plot:      string;
  log:       string;
  backcolor: string;
  /** The Bolt's own colour on the matrix. */
  matrix:    Color;
  black:     Color;
  front:     Color;
  back:      Color;
}

export interface BoltConfig {
  colors: ConfigColors;
  queue?: QueueOptions;
}
