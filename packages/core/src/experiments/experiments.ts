import type { Actuators } from '../actuators/actuators';
import type { Infrared } from '../actuators/infrared';
import type { Communication } from '../communication/communication';
import type { Context } from '../context';
import type { Navigation } from '../navigation/navigation';
import type { Sensors } from '../sensors/sensors';
import { range, wait, whenAborted } from '../helpers/utils';
import { DriveFlag, RawMotorMode, StabilizationIndex } from '../protocol/constants';
import { distance, headingTo, mod360 } from '../helpers/math';
import type { Point } from '../helpers/math';
import { DriveModel, stoppingDistance, stopNow, targetSpeed } from './landing';
import type { LandingResult } from './landing';
import { sampleLoop } from './sample-loop';
import { sendLadder } from './seek-to-collision';

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
  private readonly communication: Communication;

  constructor (ctx: Context, actuators: Actuators, sensors: Sensors, navigation: Navigation, communication: Communication) {
    this.ctx        = ctx;
    this.actuators  = actuators;
    this.sensors    = sensors;
    this.navigation = navigation;
    this.communication = communication;
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

  /** Drive models per ground, learned by rollToPointAdaptive, for the session. */
  readonly models: { [ground: string]: DriveModel } = {};

  /**
   * rollToPoint under test: the speed follows the braking curve to the
   * target, the command comes from a model the run keeps learning, and the
   * stop is timed by the predicted stopping distance, see landing.ts.
   * `ground` picks the model, since speeds and slip differ on mat and floor.
   */
  async rollToPointAdaptive (target: Point, ground: 'mat' | 'floor' = 'mat', vCruise = 60): Promise<LandingResult> {
    const model = (this.models[ground] ??= new DriveModel(ground === 'floor' ? 0.6 : 0.5));
    const freezeCm    = 5;   // closer than this the heading stays: locator noise would swing it
    const steadyAccel = 15;  // cm/s², below it the speed counts as steady and teaches the model
    const t0 = this.ctx.now();
    let budgetMs: number | null = null;  // from the first sample's distance, as rollToPoint
    let heading = this.ctx.status.heading, commands = 0;
    let last: { t: number, v: number } | null = null;
    const start = { ...this.ctx.status.position };
    const stop = { v: 0, d: 0, predicted: 0, at: null as Point | null };

    const reason = await sampleLoop(this.ctx, this.actuators, this.sensors, (sample): 'arrived' | 'budget' | undefined => {
      const here = { x: sample.locator.positionX, y: sample.locator.positionY };
      const v = Math.hypot(sample.locator.velocityX, sample.locator.velocityY);
      const d = distance(here, target);
      budgetMs ??= 2 * (2500 + d / 10 * 1000);
      const dtS = last ? (sample.t - last.t) / 1000 : 0.06;

      if (stopNow(d, v, model, dtS)) {
        stop.v = v;
        stop.d = d;
        stop.predicted = stoppingDistance(v, model);
        stop.at = here;
        return 'arrived';
      }
      if (sample.t - t0 > budgetMs) return 'budget';

      const vWanted = targetSpeed(d, model, vCruise);
      if (last && vWanted === vCruise && Math.abs(v - last.v) / dtS < steadyAccel) model.learnSpeed(vWanted, v, dtS);
      last = { t: sample.t, v };
      if (d > freezeCm) heading = headingTo(here, target);
      commands += 1;
      this.actuators.motor.rollIfIdle(model.commandFor(vWanted), heading);
      return undefined;
    });

    const at = { ...this.ctx.status.position };
    // the stop decision before learning from it: the model then changes
    const decided = stop.at ? { v: stop.v, d: stop.d, predicted: stop.predicted, coast: distance(stop.at, at) } : null;
    if (stop.at) model.learnStop(stop.v, distance(stop.at, at));
    const way = distance(start, target) || 1;
    const alongCm = ((at.x - target.x) * (target.x - start.x) + (at.y - target.y) * (target.y - start.y)) / way;
    const result: LandingResult = { reason, errorCm: distance(at, target), timeMs: this.ctx.now() - t0, commands, alongCm, stop: decided, model: { b: model.b, tauS: model.tauS } };
    this.ctx.log('info', `rollToPointAdaptive: ${reason}, ${result.errorCm.toFixed(1)} cm off (${alongCm.toFixed(1)} along), ${result.timeMs} ms, ${commands} commands`
      + (decided ? `; stop at ${decided.v.toFixed(0)} cm/s ${decided.d.toFixed(1)} cm out, predicted ${decided.predicted.toFixed(1)}, coasted ${decided.coast.toFixed(1)}` : '')
      + `; b ${model.b.toFixed(0)}, tau ${model.tauS.toFixed(2)} s`);
    return result;
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

  /**
   * Weakest infrared strength that arrives, per distance. `sender` (the
   * other Bolt's emitters) sends channel 1 ten frames at each strength of
   * `ladder` while this Bolt counts notifies; then it aims at the front lobe
   * and rolls `stepCm` toward the sender. Aim: -60 to +60 degrees in 20
   * degree steps, five frames each, at the weakest strength that arrived 5
   * of 10 here; turn to the notify-weighted mean. Ends after `minutes`, on a
   * collision (arrived), a fullstop, or when nothing arrives. Setup: start
   * facing the sender, line of sight, nothing that reflects. Basis in
   * research/infrared-external-device.md, "Bolt to Bolt, 4 m apart"
   * (2026-10-02).
   */
  async calibrateInfraredLadder (sender: Infrared, ladder = [1, 2, 4, 8, 16, 32], stepCm = 50, minutes = 2) {
    const { status } = this.ctx;
    const s = this.ctx.motion;
    const { motor } = this.actuators;
    const channel = 1;
    const t0 = Date.now();
    const start = { ...status.position };
    let notifies = 0, collisions = 0;
    const offInfrared = await this.sensors.infrared.subscribe(({ payload }) => {
      if (payload[0] === channel) notifies++;
      void this.sensors.listenInfrared(true);
    });
    const offCollision = await this.sensors.collision.subscribe(() => { collisions++; }, {});
    const release = await this.sensors.motion.subscribe(null);
    await motor.stabilize(StabilizationIndex.full);
    /** Notifies while the sender sends `frames` at `strength`, one per 200 ms. */
    const count = async (strength: number, frames: number) => {
      await this.sensors.listenInfrared(true);
      const n = notifies;
      for (let k = 0; k < frames && !s.aborted; k++) {
        const t = Date.now();
        await sender.send(channel, strength);
        await wait(Math.max(0, 200 - (Date.now() - t)));
      }
      await wait(100);
      return notifies - n;
    };
    const turnTo = async (h: number) => {
      await motor.roll(0, mod360(Math.round(h)));
      await wait(300);
      while (!status.isStill && !s.aborted) await wait(50);
    };
    const rows: { cm: number, heard: Record<number, number>, aim: number | null }[] = [];
    let reason = 'time';
    while (!s.aborted) {
      if (Date.now() - t0 > minutes * 60000) break;
      await this.communication.state('infrared', 'infra-listen');
      const heard: Record<number, number> = {};
      for (const strength of ladder) heard[strength] = await count(strength, 10);
      const row = { cm: Math.round(distance(start, status.position)), heard, aim: null as number | null };
      rows.push(row);
      this.ctx.log('info', `calibrateInfraredLadder ${row.cm} cm: ${ladder.map(st => `${st}:${heard[st]}`).join(' ')}`);
      const weakest = ladder.find(st => (heard[st] ?? 0) >= 5);
      if (weakest === undefined) { reason = 'lost'; break; }
      if (s.aborted || Date.now() - t0 > minutes * 60000) break;
      await this.communication.state('infrared', 'tracking');
      const h0 = status.heading;
      let sum = 0, weight = 0;
      for (const o of [-60, -40, -20, 0, 20, 40, 60]) {
        await turnTo(h0 + o);
        const n = await count(weakest, 5);
        sum += o * n; weight += n;
      }
      if (weight === 0) { reason = 'lost'; break; }
      row.aim = Math.round(sum / weight);
      const aim = h0 + row.aim, p = status.position;
      await this.communication.state('motor', 'cruising');
      const before = collisions;
      await this.navigation.rollToPoint({ x: p.x + stepCm * Math.sin(aim * Math.PI / 180), y: p.y + stepCm * Math.cos(aim * Math.PI / 180) });
      await this.communication.state('motor', null);
      if (collisions > before) { reason = 'collision'; break; }
    }
    if (s.aborted) reason = 'aborted';
    await this.communication.state('motor', null);
    await this.communication.state('infrared', null);
    await motor.stop();
    await motor.stabilize(StabilizationIndex.none);
    await release();
    await offCollision();
    await offInfrared();
    this.ctx.log('info', `calibrateInfraredLadder: ${reason} after ${Math.round((Date.now() - t0) / 1000)} s, ${rows.length} positions`);
    return { reason, rows };
  }

  /** Send the infrared ladder until fullstop; see seek-to-collision.ts. */
  async sendLadder (): Promise<number> {
    return sendLadder(this.ctx, this.actuators);
  }

  /**
   * Hide and seek over the room, by infrared at `strength` (the sender's).
   * The seeker drives by the front lobe only. 16 is the weakest strength
   * that reached 4 m and the one with the narrowest lobes; measured in
   * research/infrared-external-device.md, "Bolt to Bolt, 4 m apart"
   * (2026-10-02). Not written yet.
   */
  async hideAndSeek (strength = 16): Promise<void> {
    this.ctx.log('info', `hideAndSeek: strength ${strength}, not written yet`);
  }

}
