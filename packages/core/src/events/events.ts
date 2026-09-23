import type { BatteryState, ChargerState } from '../protocol/constants';
import type { Packet } from '../protocol/packet';
import type { Collision } from '../protocol/payloads';
import type { SensorSample } from '../sensors/motion';

export type LogType = 'info' | 'warn' | 'action' | 'event';

export interface LogEntry {
  readonly timestamp: number;
  readonly bolt:      string;
  readonly type:      LogType;
  readonly subtype:   string;
  readonly data?:     unknown;
}

/** A packet reduced to what a log wants to show. */
export interface PacketSummary {
  readonly id:      number;
  readonly device:  number;
  readonly command: number;
  readonly target:  number | null;
  readonly payload: readonly number[];
}

/** Everything a Bolt tells the layers above. Names are the ones views and the session log know. */
export interface BoltEvents extends Record<string, unknown> {
  log:          LogEntry;
  /** Status or queue changed; a UI may want to redraw. */
  change:       undefined;
  disconnected: undefined;
  /** Raised by lifecycle.fullstop so every running step aborts. */
  fullstop:     undefined;

  awake:        undefined;
  willsleep:    undefined;
  didsleep:     undefined;
  battery:      { readonly state: BatteryState };
  charger:      { readonly state: ChargerState };

  gyromax:      { readonly payload: readonly number[] };
  collision:    Collision;
  /** Magnetic north as a heading in the current yaw frame, after calibrateToNorth. */
  compass:      { readonly angle: number };
  infrared:     { readonly payload: readonly number[] };
  /** Raw streaming payload; the sensor layer parses it into sensordata. */
  stream:       { readonly payload: readonly number[] };
  sensordata:   SensorSample;

  scrolldone:   undefined;
  animationdone: undefined;

  /** The Bolt could not right itself within its pulse budget: the Help behavior's cue. */
  help:         { readonly reason: string; readonly tilt: number; readonly pulses: number };

  unknown:      Packet;
}
