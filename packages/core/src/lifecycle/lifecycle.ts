import type { Actuators } from '../actuators/actuators';
import type { Calibration } from '../calibration/calibration';
import type { Context } from '../context';
import type { Communication } from '../communication/communication';
import type { Navigation } from '../navigation/navigation';
import { StabilizationIndex } from '../protocol/constants';
import type { Sensors } from '../sensors/sensors';

export interface WakeResult {
  /** Whether the awake notification arrived. A Bolt that was already awake sends none. */
  readonly awakeSeen: boolean;
  readonly ms:        number;
}

/**
 * Power and session state.
 *
 * - `takeover` runs once per connection: the app assumes control, zeroes the
 *   locator, reads every value once, keeps the Bolt awake.
 * - `reset` runs whenever the Bolt is or becomes awake under our control:
 *   still, stabilized, lights, streaming mask and notification switches, all
 *   of which the firmware forgets in sleep, then a rotate, then north. It
 *   leaves the locator alone and the stabilization loop off: navigation
 *   engages the loop only while it drives.
 */
export class Lifecycle {

  private readonly ctx:       Context;
  private readonly actuators: Actuators;
  private readonly sensors:   Sensors;
  private readonly communication: Communication;
  private readonly calibration: Calibration;
  private readonly navigation:  Navigation;
  private resetting:    Promise<void> | null = null;

  constructor (ctx: Context, actuators: Actuators, sensors: Sensors, communication: Communication, calibration: Calibration, navigation: Navigation) {
    this.ctx         = ctx;
    this.actuators   = actuators;
    this.sensors     = sensors;
    this.communication   = communication;
    this.calibration = calibration;
    this.navigation  = navigation;
    void sensors.didsleep.subscribe(() => {
      ctx.status.awake = false;
      ctx.status.ready = false;
      ctx.changed();
    });
    void sensors.awake.subscribe(() => {
      ctx.status.awake = true;
      this.reset().catch((error: unknown) => ctx.log('warn', `reset after awake: ${String(error)}`));
    });
  }

  /** Wake and give the awake notification a short chance; a real transition answers in ~100 ms. */
  async wake (timeoutMs = 300): Promise<WakeResult> {
    const t0 = this.ctx.now();
    const awake = this.ctx.events.once('awake', { timeoutMs }).then(() => true, () => false);
    await this.actuators.power.wake();
    const awakeSeen = await awake;
    const ms = Math.round(this.ctx.now() - t0);
    this.ctx.log('info', awakeSeen ? `awake after ${ms} ms` : `wake acked, no awake notification within ${timeoutMs} ms, assuming awake`);
    if (!awakeSeen && this.ctx.status.awake === null) {
      this.ctx.status.awake = true;
      this.ctx.changed();
    }
    return { awakeSeen, ms };
  }

  /** Soft sleep; resolves when the Bolt reports it slept, which takes about two seconds. */
  async sleep (timeoutMs = 3000): Promise<void> {
    const slept = this.ctx.events.once('didsleep', { timeoutMs }).catch((): undefined => undefined);
    await this.actuators.power.sleep();
    await slept;
  }

  /**
   * Known body state. Safe to call at any time; concurrent calls share one run.
   * Everything here is forgotten by the firmware in sleep.
   */
  reset (): Promise<void> {
    if (this.resetting) return this.resetting;
    this.resetting = this.doReset().finally(() => {
      this.resetting = null;
    });
    return this.resetting;
  }

  private async doReset (): Promise<void> {
    this.ctx.log('info', 'reset.in');
    this.ctx.status.ready = false;
    this.ctx.changed();
    const { front, back } = this.ctx.config.colors;
    await this.actuators.motor.stop();
    await this.actuators.motor.stabilize(StabilizationIndex.none);
    await this.actuators.led.set(front, back);
    await this.communication.restingPattern();
    await this.sensors.reapply();
    await this.navigation.rotate(90);
    await this.calibration.north();
    this.ctx.status.ready = true;
    this.ctx.changed();
    this.ctx.log('info', 'reset.out');
  }

  /** The app assumes control of a freshly connected Bolt. */
  async takeover (): Promise<void> {
    this.ctx.log('info', 'takeover.in');
    await this.actuators.power.ping();
    void this.sensors.willsleep.subscribe(() => {
      if (!this.ctx.status.keepAwake) return;
      this.wake().catch((error: unknown) => this.ctx.log('warn', `keepAwake: ${String(error)}`));
    });
    const { awakeSeen } = await this.wake();
    // battery, charger, gyro max, infrared and collision feed the status and the log for the whole
    // connection. Taken awake: the sensor side does not ack switches while the Bolt sleeps.
    await this.sensors.battery.subscribe(null);
    await this.sensors.charger.subscribe(null);
    await this.sensors.gyromax.subscribe(null);
    await this.sensors.infrared.subscribe(null);
    await this.sensors.collision.subscribe(null, {});
    if (awakeSeen) await this.resetting;
    else await this.reset();
    await this.actuators.motor.resetLocator();
    await this.readAll();
    this.ctx.log('info', 'takeover.out');
  }

  /** One read of every polled value into the status. */
  async readAll (): Promise<void> {
    await this.sensors.batteryState();
    await this.sensors.chargerState();
    await this.sensors.infraredReadings();
    await this.sensors.ambientLight();
    await this.sensors.batteryVoltage();
  }

  /**
   * Abort every running step, cut the motors, blink. Bound to SPACE by the UI.
   * Motors off, not a roll at speed 0: that turns the ball on to the commanded
   * heading, which a rotate keeps 120 degrees ahead. On the mat 2026-09-23,
   * stopping a rotate(720): off came to rest within 90 ms in 6 of 6, the roll
   * turned on 105 and 122 degrees for 350 and 455 ms in 2 of 6; stopping a
   * drive at speed 70: off 1.1 to 3.1 cm after, the roll 2.4 to 4.2 cm.
   * Stabilization is off afterwards, as after every step.
   */
  async fullstop (): Promise<void> {
    this.ctx.log('info', 'Fullstop');
    this.ctx.abortMotion();
    this.ctx.events.emit('fullstop', undefined);
    await this.actuators.motor.off();
    await this.communication.blinkChar('S', 5);
  }

}
