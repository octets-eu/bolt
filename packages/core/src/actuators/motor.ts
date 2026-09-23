import type { Context } from '../context';
import { DeviceId, DrivingCommand, RawMotorMode, SensorCommand, Target } from '../protocol/constants';
import type { AckPayload } from '../protocol/payloads';
import type { Ack } from '../protocol/queue';
import type { StabilizationIndex } from '../protocol/constants';
import { clamp } from '../helpers/utils';
import { mod360 } from '../helpers/math';

/**
 * The wheels and the control loop around them. Writes the commanded heading
 * and stabilization into the status. `resetLocator` and `calibrateToNorth`
 * are filed under the sensor device by the firmware but command the ball,
 * so they live here.
 */
export class Motor {

  private readonly ctx: Context;

  constructor (ctx: Context) {
    this.ctx = ctx;
  }

  private send<N extends string> (name: N, device: DeviceId, id: number, data: readonly number[], target: Target): Promise<Ack<AckPayload<N>>> {
    return this.ctx.queue.send({ name, device, id, target, data });
  }

  /** Drive at `speed` (0..255) on `heading` (degrees). The firmware is said to stop driving after a while without a repeat, not measured. */
  async roll (speed: number, heading: number, flags = 0): Promise<void> {
    const h = mod360(Math.round(heading));
    this.ctx.status.heading = h;
    await this.send('roll', DeviceId.driving, DrivingCommand.driveWithHeading, [clamp(Math.round(speed), 0, 255), (h >> 8) & 0xff, h & 0xff, flags], Target.st);
  }

  /**
   * One roll when nothing is queued or in flight, else none. For loops that
   * steer on every sample: the newest command goes out and none pile up
   * behind a slow ack. Not awaited; a failure is logged.
   */
  rollIfIdle (speed: number, heading: number): void {
    if (this.ctx.queue.pending > 0) return;
    this.roll(speed, heading).catch((e) => this.ctx.log('warn', `rollIfIdle: ${String(e)}`));
  }

  async stop (): Promise<void> {
    await this.roll(0, this.ctx.status.heading);
  }

  /**
   * Torque straight to the wheels, bypassing the control loop; the firmware
   * switches stabilization off for it. Speeds 0..255. Stays on until `off`.
   */
  async raw (leftMode: RawMotorMode, leftSpeed: number, rightMode: RawMotorMode, rightSpeed: number): Promise<void> {
    await this.send('rawMotors', DeviceId.driving, DrivingCommand.rawMotor, [leftMode, clamp(Math.round(leftSpeed), 0, 255), rightMode, clamp(Math.round(rightSpeed), 0, 255)], Target.st);
    this.ctx.status.stabilization = 0;
  }

  async off (): Promise<void> {
    await this.raw(RawMotorMode.off, 0, RawMotorMode.off, 0);
  }

  async stabilize (index: StabilizationIndex): Promise<void> {
    await this.send('stabilize', DeviceId.driving, DrivingCommand.stabilization, [index], Target.st);
    this.ctx.status.stabilization = index;
  }

  /** The current orientation becomes heading 0. */
  async resetYaw (): Promise<void> {
    await this.send('resetYaw', DeviceId.driving, DrivingCommand.resetYaw, [], Target.st);
    this.ctx.status.heading = 0;
  }

  async resetLocator (): Promise<void> {
    await this.send('resetLocator', DeviceId.sensor, SensorCommand.resetLocator, [], Target.st);
    this.ctx.status.position = { x: 0, y: 0 };
  }

  /** Starts the firmware's compass calibration, a spin; the result arrives as the `compass` event. */
  async calibrateToNorth (): Promise<void> {
    await this.send('calibrateToNorth', DeviceId.sensor, SensorCommand.calibrateToNorth, [], Target.st);
  }

}
