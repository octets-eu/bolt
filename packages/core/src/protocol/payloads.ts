import { BatteryState, ChargerState } from './constants';
import type { Vec3 } from '../helpers/math';
import { float32At, int16At, uint16At, uint32At } from './bytes';
import type { Bytes } from './bytes';

export type { Bytes } from './bytes';

/** The collision notification, decoded here. */
export interface Collision {
  readonly t: number;
  /** Impact acceleration in g, when the firmware sent the 16 byte form. */
  readonly accel: Vec3 | null;
  readonly axis: number | null;
  readonly xMagnitude: number | null;
  readonly yMagnitude: number | null;
  readonly speed: number | null;
  readonly timestamp: number | null;
  readonly raw: readonly number[];
}

/**
 * What the ack of a command carries, by the name the command is sent under.
 * A command not listed here carries nothing and its ack payload is undefined.
 * The queue looks the decoder up by that same name, so the value on the ack
 * is typed and checked in one place: here.
 */
export interface AckPayloads {
  /** Volts, null when the ack was short. */
  batteryVoltage:   number | null;
  batteryState:     BatteryState;
  chargerState:     ChargerState;
  /** Strength at the four receivers: front left, front right, back right, back left. */
  infraredReadings: readonly number[];
  /** Lux, null when the ack was short. */
  ambientLight:     number | null;
}

export type AckPayload<N extends string> = N extends keyof AckPayloads ? AckPayloads[N] : undefined;

type Decoder<T> = (bytes: Bytes) => T;

// - - - - - decoders, bytes in, checked value out - - - - //

const BATTERY_STATES: readonly number[] = Object.values(BatteryState);
const CHARGER_STATES: readonly number[] = Object.values(ChargerState);

/** One byte; a missing or foreign value is `unknown`, which is what it means. */
export function batteryState (bytes: Bytes): BatteryState {
  const b = bytes[0];
  return b !== undefined && BATTERY_STATES.includes(b) ? (b as BatteryState) : BatteryState.unknown;
}

export function chargerState (bytes: Bytes): ChargerState {
  const b = bytes[0];
  return b !== undefined && CHARGER_STATES.includes(b) ? (b as ChargerState) : ChargerState.unknown;
}

/** uint16 in centivolts. */
export function voltage (bytes: Bytes): number | null {
  const v = uint16At(bytes, 0);
  return v === null ? null : v / 100;
}

/** float32 lux. */
export function lux (bytes: Bytes): number | null {
  return float32At(bytes, 0);
}

/** uint16 degrees: where magnetic north lies in the current yaw frame. */
export function compassAngle (bytes: Bytes): number | null {
  return uint16At(bytes, 0);
}

/**
 * Collision notification, 16 bytes, on BOLT+ 18: impact acceleration as
 * int16 per axis in 1/4096 g, the axis bits, uint16 magnitudes per axis,
 * the speed byte, a uint32 firmware timestamp. Fields are null when the
 * bytes are short; `raw` always holds what came in.
 */
export function collision (bytes: Bytes, t: number): Collision {
  const raw = bytes;
  if (bytes.length < 16) return { t, accel: null, axis: null, xMagnitude: null, yMagnitude: null, speed: null, timestamp: null, raw };
  const x = int16At(bytes, 0), y = int16At(bytes, 2), z = int16At(bytes, 4);
  return {
    t,
    accel:      x !== null && y !== null && z !== null ? { x: x / 4096, y: y / 4096, z: z / 4096 } : null,
    axis:       bytes[6] ?? null,
    xMagnitude: uint16At(bytes, 7),
    yMagnitude: uint16At(bytes, 9),
    speed:      bytes[11] ?? null,
    timestamp:  uint32At(bytes, 12),
    raw,
  };
}

/** The ack decoders by command name; the queue applies them before it resolves. */
export const ACK_DECODERS: { readonly [N in keyof AckPayloads]: Decoder<AckPayloads[N]> } = {
  batteryVoltage:   voltage,
  batteryState,
  chargerState,
  infraredReadings: (bytes) => bytes,
  ambientLight:     lux,
};

/** The decoder for a command name, or none: the command carries nothing. */
export function ackDecoder (name: string): Decoder<unknown> | undefined {
  return (ACK_DECODERS as Readonly<Record<string, Decoder<unknown> | undefined>>)[name];
}
