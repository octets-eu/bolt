import type { Actuators } from '../actuators/actuators';
import type { Context } from '../context';
import { IMAGES } from '../communication/images';
import { angleDistance, meanHeading } from '../helpers/math';
import type { Communication } from '../communication/communication';
import { StabilizationIndex } from '../protocol/constants';
import type { Sensors } from '../sensors/sensors';
import { wait, whenAborted } from '../helpers/utils';

interface SpinResult {
  /** Heading at which magnetic north lies, in the firmware's frame. */
  readonly angle:    number;
  /** Degrees of yaw the calibration spin swept; a full turn is ~360, a shell that did not turn shows ~100. */
  readonly sweep:    number;
  /** Whether the spin swept enough to trust its angle. */
  readonly accepted: boolean;
}

export interface NorthOptions {
  /** Spins at most before giving north up for this run. */
  tries?:    number | undefined;
  /** Yaw sweep a spin must reach to count. */
  minSweep?: number | undefined;
  /** Spins are averaged; below this spread (max deviation from the mean, degrees) two spins suffice, else up to tries. */
  agree?:    number | undefined;
}

export interface NorthResult {
  /** Circular mean of the accepted spins, in the firmware's frame; null when none was accepted. */
  readonly angle:  number | null;
  /** Largest deviation of an accepted spin from the mean, degrees. */
  readonly spread: number | null;
  /** Best yaw sweep any spin reached in this run. */
  readonly sweep:  number | null;
  readonly spins:  number;
  /** 'tries' when no spin was accepted, 'aborted' on fullstop. */
  readonly reason: 'done' | 'tries' | 'aborted';
}

/**
 * North as a heading.
 * Stabilization is engaged only for the moves that need it and is off
 * whenever this module returns.
 */
export class Calibration {

  private readonly ctx:       Context;
  private readonly actuators: Actuators;
  private readonly sensors:   Sensors;
  private readonly communication: Communication;

  constructor (ctx: Context, actuators: Actuators, sensors: Sensors, communication: Communication) {
    this.ctx       = ctx;
    this.actuators = actuators;
    this.sensors   = sensors;
    this.communication = communication;
  }

  /**
   * One firmware spin for magnetic north. The firmware turns the ball a full
   * turn to calibrate the magnetometer and reports north as a heading in its
   * own frame. That frame is never reset here: the locator lives in it, and a
   * yaw reset would turn one and not the other. The spin leaves the ball facing
   * anywhere, so it is turned to the reported heading. The spin is verified by
   * the yaw it swept: a shell that did not turn shows ~100°, and that north is
   * not taken. Null when `s` aborts before the spin has ended.
   */
  private async spin (s: AbortSignal, minSweep: number): Promise<SpinResult | null> {

    const aborted = whenAborted(s);
    const cal = this.ctx.status.calibration;

    let unwrapped = 0, last: number | null = null, lo = 0, hi = 0;
    const release = await this.sensors.motion.subscribe((sample) => {
      const y = sample.angles.yaw;
      if (last !== null) {
        let d = y - last;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        unwrapped += d;
      }
      last = y;
      lo = Math.min(lo, unwrapped);
      hi = Math.max(hi, unwrapped);
    });

    await this.actuators.motor.stabilize(StabilizationIndex.full);
    const compass = this.ctx.events.once('compass', { timeoutMs: 15000 });
    await this.actuators.motor.calibrateToNorth();
    const reported = await Promise.race([compass, aborted]);
    if (reported) await Promise.race([wait(1000), aborted]);  // the calibration spin has to end first
    const sweep = Math.round(hi - lo);
    const accepted = sweep >= minSweep;

    if (reported && !s.aborted && accepted) {
      await this.actuators.motor.roll(0, reported.angle);
      await Promise.race([wait(400), aborted]);
      await this.communication.showImage(IMAGES.chevron);
    }
    await this.actuators.motor.stabilize(StabilizationIndex.none);
    await release();

    if (!reported || s.aborted) return null;
    if (accepted) {
      cal.north = true;
      cal.northHeading = reported.angle;
      this.ctx.log('info', `spin: north at heading ${reported.angle}, sweep ${sweep}`);
    } else {
      cal.north = false;
      this.ctx.log('warn', `north rejected: sweep ${sweep}`);
    }
    return { angle: reported.angle, sweep, accepted };

  }

  /**
   * Magnetic north as a heading, and the ball facing it. The magnetometer
   * scatters (44, 24, 51 at one spot), so north is the circular mean of the
   * accepted spins: two suffice when they agree within `agree`, else up to
   * `tries`; the spread is kept in the status as the scatter at this spot.
   * Ends on fullstop with reason 'aborted' and north not set.
   */
  async north (options: NorthOptions = {}): Promise<NorthResult> {

    const { tries = 3, minSweep = 300, agree = 10 } = options;
    const s = this.ctx.motion;
    const cal = this.ctx.status.calibration;
    const angles: number[] = [];
    let sweep: number | null = null, spins = 0;

    cal.north = false;

    while (spins < tries) {
      spins += 1;
      const n = await this.spin(s, minSweep);
      if (!n) return { angle: null, spread: null, sweep, spins, reason: 'aborted' };
      sweep = Math.max(sweep ?? 0, n.sweep);
      if (!n.accepted) continue;
      angles.push(n.angle);
      const spread = Math.max(...angles.map(a => Math.abs(angleDistance(meanHeading(angles)!, a))));
      if (angles.length >= 2 && spread <= agree) break;
      if (spins < tries) this.ctx.log('info', angles.length === 1 ? 'north: first spin, confirming' : `north: spread ${spread.toFixed(0)}, again`);
    }

    const mean = meanHeading(angles);
    if (mean === null) {
      this.ctx.log('warn', `north tries: no spin accepted in ${spins}`);
      return { angle: null, spread: null, sweep, spins, reason: 'tries' };
    }
    const spread = Math.max(...angles.map(a => Math.abs(angleDistance(mean, a))));
    cal.north = true;
    cal.northHeading = mean;
    cal.northSpread = spread;
    this.ctx.log('info', `north ${mean.toFixed(0)}, spread ${spread.toFixed(0)} over ${angles.length} spins`);
    return { angle: mean, spread, sweep, spins, reason: 'done' };

  }

}
