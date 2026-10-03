import type { Actuators } from '../actuators/actuators';
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
 * - `takeover` runs once per connection: the app assumes control, reads
 *   every value once, keeps the Bolt awake.
 * - `reset` runs whenever the Bolt is or becomes awake under our control and
 *   leaves one defined state: yaw 0, position 0, the locator's +y along
 *   heading 0, which is the Bolt's front. Only a wake gives that (2026-10-03:
 *   a yaw reset turns the heading frame and leaves the locator axes, a
 *   locator reset zeroes the position only), so every reset sleeps and wakes
 *   the Bolt. Before that a full turn in place proves the shell turns; after
 *   it nothing moves the ball, only lights, streaming mask and notification
 *   switches go out, all of which the firmware forgets in sleep. The
 *   stabilization loop stays off: navigation engages it only while it drives.
 */
export class Lifecycle {

  private readonly ctx:       Context;
  private readonly actuators: Actuators;
  private readonly sensors:   Sensors;
  private readonly communication: Communication;
  private readonly navigation:  Navigation;
  private resetting:    Promise<void> | null = null;
  /** Steps running now, outermost first; after an error the failed ones stay. */
  private readonly running: string[] = [];

  constructor (ctx: Context, actuators: Actuators, sensors: Sensors, communication: Communication, navigation: Navigation) {
    this.ctx         = ctx;
    this.actuators   = actuators;
    this.sensors     = sensors;
    this.communication   = communication;
    this.navigation  = navigation;
    void sensors.didsleep.subscribe(() => {
      ctx.status.awake = false;
      ctx.status.ready = false;
      ctx.changed();
    });
    void sensors.awake.subscribe(() => {
      ctx.status.awake = true;
      void this.reset();
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

  /** Soft sleep; resolves on the ack. The didsleep notification follows 2 to 3.3 s later and sets the status. */
  async sleep (): Promise<void> {
    await this.actuators.power.sleep();
  }

  /**
   * Known body state. Safe to call at any time: a call during a run joins it.
   * Everything here is forgotten by the firmware in sleep.
   */
  reset (): Promise<void> {
    this.resetting ??= this.doReset();
    return this.resetting;
  }

  private async doReset (): Promise<void> {

    this.ctx.log('info', 'reset.in');
    this.ctx.status.ready = false;
    this.ctx.changed();

    const { front, back } = this.ctx.config.colors;
    
    // off, not a roll to the heading the status holds: that heading is not the Bolt's yet
    await this.actuators.motor.off();
    // the turn first: nothing moves the ball once the wake has laid its frame
    await this.sensors.reapply();
    await this.navigation.rotate(360);
    await this.sleepWake();
    this.ctx.status.heading  = 0;
    this.ctx.status.position = { x: 0, y: 0 };

    await this.actuators.motor.stabilize(StabilizationIndex.none);
    await this.actuators.led.set(front, back);
    await this.communication.log('frames');
    await this.communication.state('motor', 'resting');
    await this.sensors.reapply();
    // no north: it varies by over 100 degrees between spots 25 cm apart (research/bolt.md);
    // calibration.north() stays for the compass button
    
    this.ctx.status.ready = true;
    this.resetting = null;
    this.ctx.changed();
  
    this.ctx.log('info', 'reset.out');
  
  }

  /** Sleep, then wake; resolves on the awake notification. A commanded sleep sends no willsleep (2026-10-03). */
  private async sleepWake (): Promise<void> {
    const slept = this.ctx.events.once('didsleep', { timeoutMs: 5000 });
    await this.actuators.power.sleep();
    await slept;
    const awake = this.ctx.events.once('awake', { timeoutMs: 1000 });
    await this.actuators.power.wake();
    await awake;
  }

  /** The app assumes control of a freshly connected Bolt. */
  async takeover (): Promise<void> {
    this.ctx.log('info', 'takeover.in');
    await this.actuators.power.ping();
    void this.sensors.willsleep.subscribe(() => {
      if (!this.ctx.status.keepAwake) return;
      void this.wake();
    });
    const { awakeSeen } = await this.wake();
    // battery, charger, gyro max, infrared and collision feed the status and the log for the whole
    // connection. Taken awake: the sensor side does not ack switches while the Bolt sleeps.
    await this.sensors.battery.subscribe(null);
    await this.sensors.charger.subscribe(null);
    // the one global reaction: a flash of '!'; behaviors add listeners of their own
    await this.sensors.gyromax.subscribe(() => void this.actuators.matrix.push('flash', 'collision'));
    await this.sensors.infrared.subscribe(null);
    // half the default thresholds of 100: a hand's hit at rest should flash
    await this.sensors.collision.subscribe(() => void this.actuators.matrix.push('flash', 'collision'), { xThreshold: 50, yThreshold: 50 });
    if (awakeSeen) await this.resetting;
    else await this.reset();
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

  /**
   * One step: `<name>.in`, `fn`, `<name>.out`. Steps nest, e.g. a roll runs
   * a rollToPoint. An error passes through untouched and leaves the step
   * in `running`, for `fail` to name.
   */
  async run<T> (name: string, fn: () => Promise<T>): Promise<T> {
    this.running.push(name);
    const depth = this.running.length;
    this.ctx.log('info', `${name}.in`);
    this.ctx.events.emit('step', { name, depth, phase: 'in' });
    const result = await fn();
    this.running.pop();
    this.ctx.log('info', `${name}.out`);
    this.ctx.events.emit('step', { name, depth, phase: 'out' });
    return result;
  }

  /**
   * The end after an error: nothing is recovered, the page is reloaded. The
   * app calls it once per connected Bolt on its first error. Aborts every
   * running step and cuts the motors, not awaited: the link may be gone.
   */
  fail (error: unknown): void {
    const during = this.running.length ? ` during ${this.running.join(' > ')}` : '';
    this.ctx.log('fatal', `${String(error)}${during}, reload the page`);
    this.ctx.abortMotion();
    void this.actuators.motor.off();
    this.ctx.status.ready = false;
    this.ctx.changed();
  }

}
