import type { Actuators } from '../actuators/actuators';
import type { Context } from '../context';
import type { Sensors } from '../sensors/sensors';
import { angleDistance, distance, headingTo } from '../helpers/math';
import type { Point } from '../helpers/math';
import { StabilizationIndex } from '../protocol/constants';
import { clamp, wait } from '../helpers/utils';
import { log } from '../lifecycle/log';

export interface RotateResult {
  /** Degrees still missing to the goal, signed like the turn asked for; from the yaw. */
  readonly error:  number;
  /** Corrections after the turn, 0 to 5. */
  readonly rounds: number;
}

/**
 * Moving the ball on purpose. Every step ends on fullstop, holds the motion
 * stream while it drives and switches stabilization on before and off
 * after, itself. rotate and rollToPoint steer on every sample.
 */
export class Navigation {

  readonly logName = 'navigation';
  readonly ctx:               Context;
  private readonly actuators: Actuators;
  private readonly sensors:   Sensors;

  constructor (ctx: Context, actuators: Actuators, sensors: Sensors) {
    this.ctx       = ctx;
    this.actuators = actuators;
    this.sensors   = sensors;
  }

  /**
   * Resolve once the ball neither moves nor turns, see `status.isStill`, or
   * when `s` aborts: with a NaN locator it is never still. The caller holds
   * the motion stream. A pause in the samples is not rest: it waits for the
   * next one (2026-10-03: a stalled page left half a second without a sample
   * and ended a rotate).
   */
  public async waitForStill (s: AbortSignal): Promise<void> {
    const still = (): boolean => {
      try { return this.ctx.status.isStill; }
      catch (error) {
        if (!this.sensors.motion.active) throw error;
        return false;
      }
    };
    while (!still() && !s.aborted) await wait(50);
  }

  /**
   * Drive `distance` cm on `heading`: a rollToPoint to the point that far
   * along it, in the locator frame. The start is read from a fresh sample:
   * with the stream off the status keeps its last position, and on
   * 2026-09-23 a stale (0, 0) against a locator at (154, 20) sent a 20 cm
   * roll 170 cm.
   */
  @log
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
   * any amount: 360 is a full turn, 720 two. Positive turns clockwise, like
   * the heading; the measured yaw goes negative (rotate(94) from yaw 0 ended
   * at yaw -95, 2026-09-29). On every sample the commanded heading is set
   * `lead` degrees ahead of the yaw turned so far, capped at the goal, so
   * the ball turns without stopping at steps.
   *
   * The firmware's own loop stops short of a commanded heading and ignores
   * a small error: on the floor 2026-10-03 nothing moved under 4 degrees and
   * larger turns ended 3 (SB-9129) and 4.5 (SB-11DF) degrees short. So once
   * the ball is still the yaw is read, and what is missing is added to the
   * command, up to five rounds, until the turn is within `tolerance`. Ends
   * also when the time budget of the turn is spent, or on fullstop.
   */
  @log
  public async rotate (degrees: number, tolerance = 2, lead = 120): Promise<RotateResult> {

    if (Math.abs(degrees) <= tolerance) return { error: degrees, rounds: 0 };

    const start = this.ctx.status.heading;
    const goal  = Math.abs(degrees);
    const sign  = Math.sign(degrees);

    const settleMs      = 1200; // start, overshoot and the still window
    const degPerSec     = 330;  // turn rate on the floor, 720 minus 360
    const budgetMs      = 2 * (settleMs + goal / degPerSec * 1000);
    const maxRounds     = 5;

    const t0 = this.ctx.now();
    const s = this.ctx.motion;
    const { motor } = this.actuators;
    let swept = 0, last: number | null = null, paced = false;
    let done = (): void => {};
    const goalDue = new Promise<void>((resolve) => { done = () => { paced = true; resolve(); }; });
    /** Degrees still missing, signed like `degrees`: the yaw counts the other way round. */
    const missing = (): number => degrees + swept;
    /** The half second `isStill` looks at lies after the command. */
    const settle = async (): Promise<void> => {
      await wait(600);
      await this.waitForStill(s);
    };

    await motor.stabilize(StabilizationIndex.full);

    // the hold outlives the turn: the rounds and the result read the yaw swept
    const release = await this.sensors.motion.subscribe((sample) => {
      if (last !== null) swept += angleDistance(last, sample.angles.yaw);
      last = sample.angles.yaw;
      if (paced) return;
      const ahead = Math.min(Math.abs(swept) + lead, goal);
      if (s.aborted || ahead === goal) {
        done();
        return;
      }
      if (sample.t - t0 > budgetMs) {
        this.ctx.log('warn', `rotate: budget ${Math.round(budgetMs)} ms spent, swept ${Math.round(swept)} of ${degrees}`);
        done();
        return;
      }
      motor.rollIfIdle(0, start + sign * ahead);
    });

    await goalDue;
    let command = start + degrees, rounds = 0;
    if (!s.aborted) {
      await motor.roll(0, command);
      await settle();
    }
    while (Math.abs(missing()) > tolerance && rounds < maxRounds && !s.aborted) {
      command += missing();
      await motor.roll(0, command);
      await settle();
      rounds++;
    }

    await motor.stabilize(StabilizationIndex.none);
    await release();

    const error = Math.round(missing() * 10) / 10;
    this.ctx.log('info', `rotate ${degrees}: ${error} missing after ${rounds} rounds`);
    return { error, rounds };

  }

  /**
   * Drive to a locator point: on every sample, aim and send one roll until
   * within `tolerance`, then stop. The speed follows the locator speed: the
   * command rises while the ball is slower than half the distance per second
   * (3 to 30 cm/s) and falls while it is faster, so it breaks free on any
   * surface and slows on the approach. Ends when the time budget is spent,
   * or on fullstop.
   */
  @log
  public async rollToPoint (target: Point, tolerance = 5): Promise<void> {

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
    let speed = startSpeed, ended = false;
    let done = (): void => {};
    const arrived = new Promise<void>((resolve) => { done = () => { ended = true; resolve(); }; });
    
    await this.actuators.motor.stabilize(StabilizationIndex.full);
    
    // the hold outlives the step's end by the stop and the still wait; samples then change nothing
    const release = await this.sensors.motion.subscribe((sample) => {
      if (ended) return;
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
    await this.waitForStill(s);
    await this.actuators.motor.stabilize(StabilizationIndex.none);
    await release();

  }

}
