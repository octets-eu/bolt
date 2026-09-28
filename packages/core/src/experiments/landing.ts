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
 * the ground asks on top; `tauS` sets the stop.
 */
export class DriveModel {

  /** Command bytes per cm/s. With b = 30 it gives 70 for 27 cm/s, near the 28 measured on the mat (2026-09-17). */
  k = 1.5;
  /** Command bytes at no speed, what breaking free takes: 40 does not move the ball on the mat, 60 crawls (2026-09-17). */
  b = 30;
  /**
   * Coasting after roll 0 per speed, s: the ball rolls on `tauS · v` cm,
   * latency included. The coast grows about in proportion to the speed, not
   * with its square: ten floor landings from 32 to 70 cm/s coasted 17 to 42
   * cm, 0.5 to 0.7 s times the speed, and a constant braking rate learned
   * from them swung between 49 and 150 cm/s² (2026-09-26). Learned from each
   * landing; see the constructor for where it starts.
   */
  tauS: number;

  /** `tauS` to start from: after roll 0 the step runs coasted 0.44 to 0.53 s times the speed on the mat, 0.6 to 0.7 on the floor (2026-09-25/26). */
  constructor (tauS: number) {
    this.tauS = tauS;
  }

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

  /**
   * One landing: the ball coasted `coastCm` from speed `vAtStop`; `tauS`
   * moves 30 % toward what that shows. Stops under 30 cm/s and ratios out of
   * 0.3 to 1.0 teach nothing: on a 14 cm floor leg the locator showed 23 cm/s
   * while the wheels slipped at breakaway, the ball coasted 0.1 cm, and
   * learning halfway from it halved tauS (2026-09-26).
   */
  learnStop (vAtStop: number, coastCm: number): void {
    const ratio = coastCm / vAtStop;
    if (vAtStop < 30 || ratio < 0.3 || ratio > 1) return;
    this.tauS = clamp(this.tauS + 0.3 * (ratio - this.tauS), 0.2, 1.2);
  }

}

/** Distance the ball still covers from speed `v` after a stop. */
export function stoppingDistance (v: number, m: DriveModel): number {
  return m.tauS * v;
}

/**
 * True when a stop now lands on the target, `d` cm away, or waiting for the
 * next sample, `dtS` s later, would land beyond it. Without the look-ahead,
 * a ball still speeding up passed that point between two samples and the
 * stop came up to 13 cm late (2026-09-26).
 */
export function stopNow (d: number, v: number, m: DriveModel, dtS: number): boolean {
  return stoppingDistance(v, m) + v * dtS >= d;
}

/** Speed to aim for with `d` cm to go: the speed from which a stop lands there, `d / tauS`, capped at `vCruise`. */
export function targetSpeed (d: number, m: DriveModel, vCruise: number): number {
  return Math.min(vCruise, Math.max(0, d) / m.tauS);
}

export interface LandingResult {
  readonly reason:  'arrived' | 'budget' | 'aborted';
  /** Locator distance from the target at rest, cm. */
  readonly errorCm: number;
  readonly timeMs:  number;
  /** Roll commands asked for while driving; rollIfIdle drops those that find the queue busy. */
  readonly commands: number;
  /** Miss along the way from start to target, cm: positive past the target, negative short of it. */
  readonly alongCm: number;
  /** At the stop decision: speed, distance left, the predicted stopping distance; and the coasting that followed. Null without a stop. */
  readonly stop:    { readonly v: number, readonly d: number, readonly predicted: number, readonly coast: number } | null;
  /** The model after this run. */
  readonly model:   { readonly b: number, readonly tauS: number };
}
