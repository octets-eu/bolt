import type { Actuators } from '../actuators/actuators';
import type { Context } from '../context';
import type { Sensors } from '../sensors/sensors';
import { angleDistance, distance, headingTo } from '../helpers/math';
import type { Point } from '../helpers/math';
import { StabilizationIndex } from '../protocol/constants';
import { clamp, wait } from '../helpers/utils';

/**
 * Moving the ball on purpose. Every step ends on fullstop, holds the motion
 * stream while it drives and switches stabilization on before and off
 * after, itself. rotate and rollToPoint steer on every sample.
 */
export class Navigation {

  private readonly ctx:       Context;
  private readonly actuators: Actuators;
  private readonly sensors:   Sensors;

  constructor (ctx: Context, actuators: Actuators, sensors: Sensors) {
    this.ctx       = ctx;
    this.actuators = actuators;
    this.sensors   = sensors;
  }

  /** Resolve once the ball neither moves nor turns, see `status.isStill`; the caller holds the motion stream. */
  public async waitForStill (): Promise<void> {
    while (!this.ctx.status.isStill) await wait(50);
  }

  /**
   * Drive `distance` cm on `heading`: a rollToPoint to the point that far
   * along it, in the locator frame. The start is read from a fresh sample:
   * with the stream off the status keeps its last position, and on
   * 2026-09-23 a stale (0, 0) against a locator at (154, 20) sent a 20 cm
   * roll 170 cm.
   */
  public async roll (distance: number, heading: number): Promise<void> {
    const release = await this.sensors.motion.subscribe(null);
    await this.ctx.events.once('sensordata', { timeoutMs: 1000 });
    const { x, y } = this.ctx.status.position;
    const h = heading * Math.PI / 180;
    await this.rollToPoint({ x: x + distance * Math.sin(h), y: y + distance * Math.cos(h) });
    await release();
  }

  /**
   * Turn in place by `degrees` from the commanded heading, either way and
   * any amount: 360 is a full turn, 720 two. On every sample the commanded
   * heading is set `lead` degrees ahead of the yaw turned so far, capped at
   * the goal, so the ball turns without stopping at steps. Ends once the
   * goal is commanded and the ball has turned and is still, when the time
   * budget is spent, or on fullstop.
   */
  public async rotate (degrees: number, lead = 120): Promise<void> {

    // isStill sees no turn under 1 degree, the loop would wait for one forever
    if (Math.abs(degrees) < 1) return;

    this.ctx.log('info', `rotate.in`);

    const start = this.ctx.status.heading;
    const goal  = Math.abs(degrees);
    const sign  = Math.sign(degrees);

    const settleMs      = 1200; // start, overshoot and the still window
    const degPerSec     = 330;  // turn rate on the floor, 720 minus 360
    const budgetMs      = 2 * (settleMs + goal / degPerSec * 1000);

    const t0 = this.ctx.now();
    const s = this.ctx.motion;
    let swept = 0, last: number | null = null, moved = false;
    let done = (): void => {};
    const turned = new Promise<void>((resolve) => { done = resolve; });

    await this.actuators.motor.stabilize(StabilizationIndex.full);

    const release = await this.sensors.motion.subscribe((sample) => {
      if (last !== null) swept += angleDistance(last, sample.angles.yaw);
      last = sample.angles.yaw;
      const still = this.ctx.status.isStill;
      moved ||= !still;
      const ahead = Math.min(Math.abs(swept) + lead, goal);
      if (s.aborted || (ahead === goal && moved && still)) {
        done();
        return;
      }
      if (sample.t - t0 > budgetMs) {
        this.ctx.log('warn', `rotate: budget ${Math.round(budgetMs)} ms spent, swept ${Math.round(swept)} of ${degrees}`);
        done();
        return;
      }
      this.actuators.motor.rollIfIdle(0, start + sign * ahead);
    });

    await turned;
    await this.waitForStill();
    await this.actuators.motor.stabilize(StabilizationIndex.none);
    await release();

    this.ctx.log('info', `rotate.out`);

  }

  /**
   * Drive to a locator point: on every sample, aim and send one roll until
   * within `tolerance`, then stop. The speed follows the locator speed: the
   * command rises while the ball is slower than half the distance per second
   * (3 to 30 cm/s) and falls while it is faster, so it breaks free on any
   * surface and slows on the approach. Ends when the time budget is spent,
   * or on fullstop.
   */
  public async rollToPoint (target: Point, tolerance = 5): Promise<void> {

    this.ctx.log('info', `rollToPoint.in`);

    const startSpeed    = 30;   // command at the first sample
    const speedStep     = 3;    // command change per sample, ~17 samples/s
    const minSpeed      = 15;   // command range
    const maxSpeed      = 100;
    const secondsToGo   = 2;    // wanted speed is the distance covered in this time
    const minWant       = 3;    // wanted speed range, cm/s
    const maxWant       = 30;
    const settleMs      = 2500; // breakaway and the approach under 3 cm/s
    const cmPerSec      = 10;   // mean over a leg on the floor
    let budgetMs: number | null = null; // from the first sample's distance; status.position is stale while the stream is off

    const t0 = this.ctx.now();
    const s = this.ctx.motion;
    let speed = startSpeed;
    let done = (): void => {};
    const arrived = new Promise<void>((resolve) => { done = resolve; });
    
    await this.actuators.motor.stabilize(StabilizationIndex.full);
    
    const release = await this.sensors.motion.subscribe((sample) => {
      const here = { x: sample.locator.positionX, y: sample.locator.positionY };
      const d = distance(here, target);
      if (d <= tolerance || s.aborted) {
        done();
        return;
      }
      budgetMs ??= 2 * (settleMs + d / cmPerSec * 1000);
      if (sample.t - t0 > budgetMs) {
        this.ctx.log('warn', `rollToPoint: budget ${Math.round(budgetMs)} ms spent, ${Math.round(d)} cm left`);
        done();
        return;
      }
      const want = clamp(d / secondsToGo, minWant, maxWant);
      const have = Math.hypot(sample.locator.velocityX, sample.locator.velocityY);
      speed = clamp(speed + (have < want ? speedStep : -speedStep), minSpeed, maxSpeed);
      this.actuators.motor.rollIfIdle(speed, headingTo(here, target));
    });

    await arrived;
    await this.actuators.motor.stop();
    await this.waitForStill();
    await this.actuators.motor.stabilize(StabilizationIndex.none);
    await release();
    
    this.ctx.log('info', `rollToPoint.out`);
  
  }

}
