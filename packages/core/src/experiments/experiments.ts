import type { Actuators } from '../actuators/actuators';
import type { Context } from '../context';
import type { Navigation } from '../navigation/navigation';
import type { Sensors } from '../sensors/sensors';
import { range, wait, whenAborted } from '../helpers/utils';
import { DriveFlag, RawMotorMode, StabilizationIndex } from '../protocol/constants';

/**
 * Experiments: functions under test, a work log in code, run from the
 * console as `bolt.experiments.hop(90)`. A function stays here while it is
 * tried and measured and moves into its folder when it qualifies. A
 * fullstop ends every one that moves the ball, like a navigation step.
 */
export class Experiments {

  private readonly ctx:       Context;
  private readonly actuators: Actuators;
  private readonly sensors:   Sensors;
  private readonly navigation: Navigation;

  constructor (ctx: Context, actuators: Actuators, sensors: Sensors, navigation: Navigation) {
    this.ctx        = ctx;
    this.actuators  = actuators;
    this.sensors    = sensors;
    this.navigation = navigation;
  }

  /**
   * Lock-in reading of the light sensor: amplitude of the modulation at `hz`
   * over `seconds`, and the mean. A steady lamp or a window contributes
   * nothing to the amplitude; a lighthouse blinking at `hz` does.
   */
  async lighthouse (hz: number = 2, seconds: number = 2) {
    const t0 = performance.now();
    const samples: { t: number, lux: number }[] = [];
    while (performance.now() - t0 < seconds * 1000) {
      await this.sensors.ambientLight();
      samples.push({ t: (performance.now() - t0) / 1000, lux: this.ctx.status.ambient ?? 0 });
    }
    const n = samples.length;
    if (n < 4) return { n, error: 'too few samples' };
    const mean = samples.reduce((s, x) => s + x.lux, 0) / n;
    // continuous-time DFT at hz on the actual sample times (the queue does not tick evenly)
    let re = 0, im = 0;
    for (const x of samples) {
      const a = 2 * Math.PI * hz * x.t;
      re += (x.lux - mean) * Math.cos(a);
      im -= (x.lux - mean) * Math.sin(a);
    }
    const amplitude = 2 * Math.hypot(re, im) / n;
    const phase = Math.atan2(im, re);
    const result = { hz, n, rate: Math.round(n / seconds), mean: Math.round(mean * 100) / 100, amplitude: Math.round(amplitude * 100) / 100, phase: Math.round(phase * 100) / 100 };
    this.ctx.log('info', `lighthouse ${hz} Hz: amplitude ${result.amplitude} lux, mean ${result.mean} lux, ${n} samples`);
    return result;
  }

  /**
   * Get back onto the mat after falling off its edge, using nothing but the
   * Bolt's own senses: `heading` is the direction back onto the mat (the
   * direction it fell off, reversed). Retreat by the locator to get a run-up,
   * charge at `speed`, keep rolling `graceMs` after the lip shows up on the
   * accelerometer or the collision detector, stop on `timeoutMs` regardless.
   */
  async hop (heading: number, speed: number = 110, graceMs: number = 250, retreatCm: number = 20, timeoutMs: number = 1200) {
    const { status } = this.ctx;
    const s = this.ctx.motion;
    const motor = this.actuators.motor;
    const pos = () => ({ x: status.position.x || 0, y: status.position.y || 0 });
    const dist = (a: { x: number, y: number }, c: { x: number, y: number }) => Math.hypot(a.x - c.x, a.y - c.y);
    const release = await this.sensors.motion.subscribe(null);
    await wait(300);
    // 1. retreat until the locator says retreatCm, or 1.5 s
    const start = pos();
    let t0 = Date.now();
    while (dist(pos(), start) < retreatCm && Date.now() - t0 < 1500 && !s.aborted) {
      await motor.roll(70, (heading + 180) % 360);
      await wait(80);
    }
    await motor.stop();
    await wait(600);
    const retreated = Math.round(dist(pos(), start));
    // 2. arm the lip detectors: accelerometer deviation from rest, and the collision event
    const acc = () => {
      const a = status.accel;
      return a ? Math.hypot(a.x, a.y, a.z) : NaN;
    };
    const rest: number[] = [];
    for (let i = 0; i < 5; i++) {
      await wait(100);
      if (!isNaN(acc())) rest.push(acc());
    }
    const baseline = rest.length ? rest.reduce((s, v) => s + v, 0) / rest.length : 1;
    let lipAt: number | null = null, lipBy = '';
    let maxDev = 0;
    const onCollision = () => {
      if (lipAt === null) {
        lipAt = Date.now() - t0;
        lipBy = 'collision';
      }
    };
    const offCollision = await this.sensors.collision.subscribe(onCollision, {});
    // 3. charge
    const charged = pos();
    t0 = Date.now();
    let reason = 'timeout';
    while (Date.now() - t0 < timeoutMs && !s.aborted) {
      await motor.roll(speed, heading);
      await wait(60);
      const dev = Math.abs(acc() - baseline);
      if (dev > maxDev) maxDev = dev;
      if (lipAt === null && dev > 0.6) {
        lipAt = Date.now() - t0;
        lipBy = 'accelerometer';
      }
      if (lipAt !== null && Date.now() - t0 >= lipAt + graceMs) {
        reason = lipBy;
        break;
      }
    }
    if (s.aborted) reason = 'aborted';
    await motor.stop();
    await offCollision();
    await release();
    await wait(500);
    const result = { heading, speed, graceMs, retreated, charged: Math.round(dist(pos(), charged)), reason, lipAtMs: lipAt, maxAccelDeviation: Math.round(maxDev * 100) / 100, baselineG: Math.round(baseline * 100) / 100 };
    this.ctx.log('info', `hop ${heading}° @${speed}: ${reason}${lipAt !== null ? ` lip at ${lipAt} ms` : ''}, charged ${result.charged} cm`);
    return result;
  }

  /** Rotate in place and take a lock-in reading per heading; the lobe of amplitudes points at the lighthouse. */
  async sweep (hz: number = 2, steps: number = 12, seconds: number = 1.5) {
    const s = this.ctx.motion;
    const start = this.ctx.status.heading || 0;
    const rows: { heading: number, amplitude: number, mean: number }[] = [];
    for (let k = 0; k < steps && !s.aborted; k++) {
      const heading = (start + k * 360 / steps) % 360;
      await this.actuators.motor.roll(0, heading);
      await wait(400);
      const r = await this.lighthouse(hz, seconds);
      if ('error' in r) throw new Error(r.error);
      rows.push({ heading: Math.round(heading), amplitude: r.amplitude, mean: r.mean });
    }
    if (!s.aborted) await this.actuators.motor.roll(0, start);
    const best = rows.reduce<typeof rows[number] | null>((m, r) => !m || r.amplitude > m.amplitude ? r : m, null);
    if (best) this.ctx.log('info', `sweep ${hz} Hz: best heading ${best.heading} with ${best.amplitude} lux`);
    return { best, rows };
  }

  /**
   * The drive's own limits, read later from the pitch: `runs` steps from rest
   * at `speed` for `stepMs`, each ended by a brake (roll 0), alternating
   * heading 0 and 180 so the ball swings about its start. Aim first, heading
   * 0 along a free line. Only drives and marks: the samples and commands land
   * in the session file between `tiltStep n: step` and `tiltStep n: brake`,
   * where the evaluation finds tilt, its rise, the braking and the latency.
   * `brake`: roll0 lets the firmware slow down; reverse drives backward on
   * the same heading at `brakeValue` until the ball is slow, then roll 0 (the
   * firmware chases that backward speed at full effort, the wheels spin back
   * inside the shell); ramp lowers the forward speed to 0 over `brakeValue`
   * ms, one roll per 50 ms; rawBrake sends raw mode 3, undocumented (the
   * documented modes are 0 to 2), until still.
   */
  async tiltStep (runs = 10, speed = 150, stepMs = 400, brake: 'roll0' | 'reverse' | 'ramp' | 'rawBrake' = 'roll0', brakeValue = 150): Promise<void> {
    const s = this.ctx.motion;
    const motor = this.actuators.motor;
    const release = await this.sensors.motion.subscribe(null);
    await motor.stabilize(StabilizationIndex.full);
    this.ctx.log('info', `tiltStep: ${runs} runs at ${speed} for ${stepMs} ms, brake ${brake}${brake === 'reverse' || brake === 'ramp' ? ` ${brakeValue}` : ''}`);
    for (let i = 1; i <= runs && !s.aborted; i++) {
      const heading = i % 2 ? 0 : 180;
      await motor.roll(0, heading);  // turn in place, then settle
      await wait(300);
      await this.navigation.waitForStill(s);
      if (s.aborted) break;
      this.ctx.log('info', `tiltStep ${i}: step heading ${heading}`);
      await motor.roll(speed, heading);
      await Promise.race([wait(stepMs), whenAborted(s)]);
      this.ctx.log('info', `tiltStep ${i}: brake`);
      if (brake === 'reverse') {
        // until the speed along the way it was going is gone; the carriage's swing
        // makes the plain speed jump, which ended the first tries after ~100 ms
        const { x: ux, y: uy } = this.ctx.status.velocity;
        const norm = Math.hypot(ux, uy) || 1;
        await motor.roll(brakeValue, heading, DriveFlag.backward);
        const t0 = this.ctx.now();
        while (!s.aborted && this.ctx.now() - t0 < 2000) {
          await wait(20);
          const { x, y } = this.ctx.status.velocity;
          if ((x * ux + y * uy) / norm < 3) break;
        }
        this.ctx.log('info', `tiltStep ${i}: brake end`);
        await motor.stop();
      } else if (brake === 'ramp') {
        const t0 = this.ctx.now();
        for (let left = 1; left > 0 && !s.aborted; left = 1 - (this.ctx.now() - t0) / brakeValue) {
          await motor.roll(speed * left, heading);
          await wait(50);
        }
        this.ctx.log('info', `tiltStep ${i}: brake end`);
        await motor.stop();
      } else if (brake === 'rawBrake') {
        await motor.raw(RawMotorMode.brake, 0, RawMotorMode.brake, 0);
      } else {
        await motor.stop();
      }
      await wait(300);
      await this.navigation.waitForStill(s);
      if (brake === 'rawBrake') await motor.stop();  // back under the drive's control
    }
    await motor.stabilize(StabilizationIndex.none);
    await release();
    this.ctx.log('info', 'tiltStep: done');
  }

  /** `times` random points on a circle of `radius` around the locator origin, by rollToPoint. */
  async circleAround (times: number, radius: number): Promise<void> {
    const s = this.ctx.motion;
    for (const _ of range(times)) {
      if (s.aborted) return;
      const angle = Math.random() * Math.PI * 2;
      await this.navigation.rollToPoint({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    }
  }

  /** Twenty random points on a 35 cm circle, then home. */
  async action (): Promise<void> {
    const s = this.ctx.motion;
    await this.circleAround(20, 35);
    if (!s.aborted) await this.navigation.rollToPoint({ x: 0, y: 0 });
  }

  /** Home, twenty points, home. */
  async stress (): Promise<void> {
    const s = this.ctx.motion;
    this.ctx.log('info', 'stress.in');
    await this.navigation.rollToPoint({ x: 0, y: 0 });
    if (!s.aborted) await this.circleAround(20, 35);
    if (!s.aborted) await this.navigation.rollToPoint({ x: 0, y: 0 });
    this.ctx.log('info', 'stress.out');
  }

}
