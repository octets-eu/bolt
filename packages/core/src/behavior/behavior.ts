import type { Actuators } from '../actuators/actuators';
import type { Context } from '../context';
import type { Sensors } from '../sensors/sensors';
import type { Point } from '../helpers/math';
import { reach } from './reach';
import type { ReachResult } from './reach';

/**
 * Behaviors: closed loops over the Bolt's own senses with a fixed setpoint and
 * a budget, each in its own file, see research/behaviors.md. They command the
 * motor themselves and use no navigation step, and return a result with a
 * reason instead of throwing.
 */
export class Behavior {

  private readonly ctx:       Context;
  private readonly actuators: Actuators;
  private readonly sensors:   Sensors;

  constructor (ctx: Context, actuators: Actuators, sensors: Sensors) {
    this.ctx       = ctx;
    this.actuators = actuators;
    this.sensors   = sensors;
  }

  /** Roll to a locator point, over what can be charged over; see reach.ts. */
  reach (target: Point, tolerance = 5): Promise<ReachResult> {
    return reach(this.ctx, this.actuators, this.sensors, target, tolerance);
  }

}
