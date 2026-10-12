import type { Actuators } from '../actuators/actuators';
import type { Communication } from '../communication/communication';
import type { Context } from '../context';
import type { Sensors } from '../sensors/sensors';
import type { Point } from '../helpers/math';
import { reach } from './reach';
import type { ReachResult } from './reach';
import { lockOn } from './lock-on';
import type { LockOnResult } from './lock-on';
import { sweep } from './sweep';
import { negotiateLadder } from './negotiate-ladder';
import type { NegotiateResult } from './negotiate-ladder';
import type { LadderRange } from '../communication/communication';
import type { LadderAuthority } from '../referee/referee';
import type { SweepOptions, SweepResult } from './sweep';
import { log } from '../lifecycle/log';

/**
 * Behaviors: closed loops over the Bolt's own senses with a fixed setpoint and
 * a budget, each in its own file, see research/behaviors.md. They command the
 * motor themselves and use no navigation step, and return a result with a
 * reason instead of throwing.
 */
export class Behavior {

  readonly logName = 'behavior';
  readonly ctx:               Context;
  private readonly actuators: Actuators;
  private readonly sensors:   Sensors;
  private readonly communication: Communication;

  constructor (ctx: Context, actuators: Actuators, sensors: Sensors, communication: Communication) {
    this.ctx       = ctx;
    this.actuators = actuators;
    this.sensors   = sensors;
    this.communication = communication;
  }

  /** Roll to a locator point, over what can be charged over; see reach.ts. */
  @log
  async reach (target: Point, tolerance = 5): Promise<ReachResult> {
    return reach(this.ctx, this.actuators, this.sensors, target, tolerance);
  }

  /** Turn to face a Bolt that sends `channel` weakly; see lock-on.ts. */
  @log
  async lockOn (channel: number): Promise<LockOnResult> {
    return lockOn(this.ctx, this.actuators, this.sensors, this.communication, channel);
  }

  /** Ask the referee for a ladder and wait for its first frame; see negotiate-ladder.ts. */
  @log
  async negotiateLadder (referee: LadderAuthority, range: LadderRange = 'long'): Promise<NegotiateResult> {
    return negotiateLadder(this.ctx, this.sensors, referee, range);
  }

  /** Where the Bolt that sends the ladder is, from a standing turn; see sweep.ts. */
  @log
  async sweep (options: SweepOptions): Promise<SweepResult> {
    return sweep(this.ctx, this.actuators, this.sensors, this.communication, options);
  }

}
