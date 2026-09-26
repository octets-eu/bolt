import { clamp } from '../helpers/utils';

/**
 * Landing on a point: how fast the ball should be with `d` cm to go, and
 * when a stop lands it there. Pure physics over a DriveModel; the loop that
 * drives with it is `experiments.rollToPointAdaptive`. Measured values:
 * research/bolt.md, "Drive limits".
 */

/**
 * What the loop knows about the ball on one ground, learned as it drives.
 * Command byte for a speed: `k · v + b`. `k` stays fixed, `b` absorbs what
 * the ground asks on top; braking rate and latency set the stop.
 */
export class DriveModel {

  /** Command bytes per cm/s. With b = 30 it gives 70 for 27 cm/s, near the 28 measured on the mat (2026-09-17). */
  k = 1.5;
  /** Command bytes at no speed, what breaking free takes: 40 does not move the ball on the mat, 60 crawls (2026-09-17). */
  b = 30;
  /** Braking with roll 0, cm/s²: 50 to 65 on mat and floor (2026-09-25/26); the low end is the safe start. */
  aBrake = 50;
  /** From a command to its first effect, s: 140 to 210 ms (2026-09-25/26). */
  latencyS = 0.2;

  /** The command byte for speed `v` cm/s. */
  commandFor (v: number): number {
    return clamp(this.k * v + this.b, 0, 255);
  }

  /**
   * One sample at steady speed: `b` follows the speed error, slowly. Only
   * while the speed holds: under acceleration the error is the firmware's
   * rate limit, not the model's, and learning then would wind `b` up.
   */
  learnSpeed (vWanted: number, v: number, dtS: number): void {
    this.b = clamp(this.b + 0.5 * (vWanted - v) * dtS, 0, 120);
  }

  /** One landing: the ball coasted `coastCm` from speed `vAtStop`; `aBrake` moves halfway to what that shows. */
  learnStop (vAtStop: number, coastCm: number): void {
    const braking = coastCm - vAtStop * this.latencyS;
    if (vAtStop < 5 || braking <= 0) return;
    this.aBrake = clamp((this.aBrake + vAtStop ** 2 / (2 * braking)) / 2, 20, 150);
  }

}

/** Distance the ball still covers from speed `v` after a stop: on through the latency, then braking. */
export function stoppingDistance (v: number, m: DriveModel): number {
  return v * m.latencyS + v ** 2 / (2 * m.aBrake);
}

/** True when a stop now lands on the target, `d` cm away. */
export function stopNow (d: number, v: number, m: DriveModel): boolean {
  return stoppingDistance(v, m) >= d;
}

/** Speed to aim for with `d` cm to go: the braking curve √(2 · aBrake · d), capped at `vCruise`. */
export function targetSpeed (d: number, m: DriveModel, vCruise: number): number {
  return Math.min(vCruise, Math.sqrt(2 * m.aBrake * Math.max(0, d)));
}

export interface LandingResult {
  readonly reason:  'arrived' | 'budget' | 'aborted';
  /** Locator distance from the target at rest, cm. */
  readonly errorCm: number;
  readonly timeMs:  number;
  /** Roll commands asked for while driving; rollIfIdle drops those that find the queue busy. */
  readonly commands: number;
  /** The model after this run. */
  readonly model:   { readonly b: number, readonly aBrake: number };
}
