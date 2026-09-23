import type { BatteryState, ChargerState, StreamGroupName } from '../protocol/constants';
import type { Collision } from '../protocol/payloads';
import type { Point, Vec3 } from '../helpers/math';
import type { Angles } from '../sensors/motion';
import { BoltError } from '../errors';
import { StatusBuffer } from './status-buffer';

/**
 * What is known about a Bolt. Written by the sensor layer, the receiver and the
 * actuators (for what was commanded); read by everything above. Null means
 * never measured.
 *
 * One instance per connected Bolt, never a singleton: the balls are two and
 * their states are two.
 */
export class Status {
  rssi:          number | null = null;
  txPower:       number | null = null;
  keepAwake:     boolean = true;
  /** Last awake / didsleep notification. */
  awake:         boolean | null = null;
  /** Body state known: a `lifecycle.reset` completed since the last wake. Sleep and a new reset clear it. */
  ready:         boolean = false;
  /** Commanded heading in degrees, 0..359. */
  heading:       number = 0;
  stabilization: number | null = null;
  voltage:       number | null = null;
  battery:       BatteryState | null = null;
  charger:       ChargerState | null = null;
  /** Lux. */
  ambient:       number | null = null;
  /** Four receiver strengths: front left, front right, back right, back left. */
  infrared:      readonly number[] | null = null;
  angles:        Angles | null = null;
  /** Latest accelerometer sample in g. */
  accel:         Vec3 | null = null;
  gyro:          Vec3 | null = null;
  /** Locator, cm. Zero after resetLocator. */
  position:      Point = { x: 0, y: 0 };
  velocity:      Point = { x: 0, y: 0 };
  /** cm/s from the locator. */
  speed:         number | null = null;
  streaming:     { active: boolean; interval: number; groups: readonly StreamGroupName[] } = { active: false, interval: 0, groups: [] };
  matrix:        { rotation: number; owner: string | null } = { rotation: 0, owner: null };
  collision:     Collision | null = null;
  /**
   * What calibration established.
   * `northHeading` is where magnetic north lies in the firmware's heading
   * frame; the frame itself is never reset, so the locator stays aligned with it.
   */
  calibration:   {
    north: boolean;
    northHeading: number | null;
    /** Largest deviation of a spin from the mean north, degrees; the magnetometer's scatter at this spot. */
    northSpread: number | null;
  } = { north: false, northHeading: null, northSpread: null };

  /**
   * The motion history, one sample per packet. Additive: the fields above
   * keep holding the newest values as they always have, and a call site
   * moves to the buffer when a window answers it better than a last value.
   */
  readonly buffer = new StatusBuffer();

  /**
   * Neither moved nor turned across the last half second: locator extent
   * under 1 cm, yaw span under 1 degree. At rest both sit at their floors,
   * 0.01 cm and 0.002 degrees; after a turn the yaw is fixed from 0.7 s.
   * Throws without a sample in the last half second: the caller must hold
   * the motion stream, a stale window would answer still forever.
   */
  get isStill (): boolean {
    const w = this.buffer.last(500);
    if (w.newest === null || Date.now() - w.newest > 500) throw new BoltError('isStill: no motion sample in the last 500 ms');
    return w.position.extent! <= 1 && w.angles.yaw.span! <= 1;
  }
}
