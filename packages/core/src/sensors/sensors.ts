import type { Context } from '../context';
import type { BoltEvents } from '../events/events';
import { DeviceId, PowerCommand, SensorCommand, Target } from '../protocol/constants';
import type { BatteryState, ChargerState } from '../protocol/constants';
import type { AckPayload } from '../protocol/payloads';
import type { Ack } from '../protocol/queue';
import type { Collision } from '../protocol/payloads';
import { motionStream } from './motion';
import type { MotionStream } from './motion';
import { Stream } from '../events/stream';
import type { StreamSource } from '../events/stream';

export interface CollisionOptions {
  /** Impact thresholds per axis. 0 does not disable the axis: it fires every dead time, at rest too; both at 0 fire nothing (2026-09-23). */
  xThreshold?: number;
  yThreshold?: number;
  /** Speed-scaled addition to the thresholds. */
  xSpeed?: number;
  ySpeed?: number;
  /** Dead time after a collision in 10 ms units. */
  deadTime?: number;
}

const COLLISION_DEFAULTS: Required<CollisionOptions> = { xThreshold: 100, yThreshold: 100, xSpeed: 100, ySpeed: 100, deadTime: 10 };

/**
 * Bottom layer, the hardware and nothing else. Three kinds of things:
 * values to read (one packet, the status gets the value), the streams, and
 * the switches and masks the streams drive. Nothing here waits or judges.
 *
 * Every stream has the same subscribe and release. The first hold switches
 * the notification or mask on, the last release switches it off, `reapply`
 * sends every current setting again after a sleep. See `Stream`.
 *
 * The sensor side does not ack switches while the Bolt sleeps, the power
 * side does: take holds awake. See README.md in this folder for the facts
 * the code relies on.
 */
export class Sensors {

  /** Angles, accelerometer, locator, gyro, at `SAMPLE_INTERVAL_MS`. */
  readonly motion:    MotionStream;
  /**
   * Impacts. The firmware has one detector: it runs at the most sensitive
   * setting any hold asks for, and every hold sees every impact. The door to
   * hard and soft holds is `accept` on the source, once the firmware's
   * threshold units are matched to the magnitudes it reports. That needs
   * test cases first: known bumps and a drop, each with its reported
   * magnitudes, so a hold's threshold can be checked against them.
   */
  readonly collision: Stream<Collision, CollisionOptions>;
  readonly battery:   Stream<BoltEvents['battery']>;
  readonly charger:   Stream<BoltEvents['charger']>;
  readonly gyromax:   Stream<BoltEvents['gyromax']>;
  /** Robot-to-robot infrared messages; the hold listens on all channels. */
  readonly infrared:  Stream<BoltEvents['infrared']>;
  // sent by the Bolt unasked, nothing to switch
  readonly awake:     Stream<undefined>;
  readonly willsleep: Stream<undefined>;
  readonly didsleep:  Stream<undefined>;
  readonly compass:   Stream<BoltEvents['compass']>;

  private readonly ctx: Context;
  private readonly streams: { reapply (): Promise<void> }[] = [];

  constructor (ctx: Context) {
    this.ctx = ctx;
    this.motion    = this.add(motionStream(ctx, (interval, mask, extended) => this.setStreamingMasks(interval, mask, extended)));
    this.collision = this.fromEvent('collision', {
      key:       (held) => JSON.stringify(this.mergeCollision(held)),
      configure: (held) => this.configureCollision(held.length ? this.mergeCollision(held) : false),
      accept:    (event, options) => this.reachesCollision(event, options),
    });
    this.battery   = this.fromEvent('battery',  { configure: (held) => this.enableBatteryNotify(held.length > 0) });
    this.charger   = this.fromEvent('charger',  { configure: (held) => this.enableChargerNotify(held.length > 0) });
    this.gyromax   = this.fromEvent('gyromax',  { configure: (held) => this.enableGyroMaxNotify(held.length > 0) });
    this.infrared  = this.fromEvent('infrared', { configure: (held) => this.listenInfrared(held.length > 0) });
    this.awake     = this.fromEvent('awake');
    this.willsleep = this.fromEvent('willsleep');
    this.didsleep  = this.fromEvent('didsleep');
    this.compass   = this.fromEvent('compass');
  }

  /** Every stream's setting again, after a sleep wiped them, the extended mask included. */
  async reapply (): Promise<void> {
    this.extendedApplied = 0;
    for (const stream of this.streams) await stream.reapply();
  }

  private add<S extends { reapply (): Promise<void> }> (stream: S): S {
    this.streams.push(stream);
    return stream;
  }

  /**
   * Whether an impact reaches a hold's own thresholds. The firmware runs at the
   * most sensitive setting any hold asks for; the power it reports is on the
   * threshold's scale (20 to 30 at 20, 135 to 179 at 100, 2026-09-23), so each
   * hold sees only what its own thresholds would have fired on. Speed terms are
   * not compared, the scaling is undocumented. A short notification has no
   * power and reaches every hold.
   */
  private reachesCollision (event: Collision, options: CollisionOptions | undefined): boolean {
    if (event.xMagnitude === null || event.yMagnitude === null) return true;
    return event.xMagnitude >= (options?.xThreshold ?? COLLISION_DEFAULTS.xThreshold)
      || event.yMagnitude >= (options?.yThreshold ?? COLLISION_DEFAULTS.yThreshold);
  }

  /** The most sensitive setting any hold asks for: the lowest of each threshold, the shortest dead time. */
  private mergeCollision (held: readonly CollisionOptions[]): Required<CollisionOptions> {
    const out = { ...COLLISION_DEFAULTS };
    for (const o of held) {
      for (const k of Object.keys(COLLISION_DEFAULTS) as (keyof CollisionOptions)[]) {
        const v = o[k];
        if (v !== undefined && v < out[k]) out[k] = v;
      }
    }
    return out;
  }

  /** A stream fed by one notification the receiver already parses into a typed event. */
  private fromEvent<K extends keyof BoltEvents, O = undefined> (name: K, source: StreamSource<BoltEvents[K], O> = {}): Stream<BoltEvents[K], O> {
    const stream = new Stream<BoltEvents[K], O>(source);
    this.ctx.events.on(name, (payload) => stream.push(payload));
    return this.add(stream);
  }

  private send<N extends string> (name: N, device: DeviceId, id: number, data: readonly number[] = [], target: Target = Target.st): Promise<Ack<AckPayload<N>>> {
    return this.ctx.queue.send({ name, device, id, target, data });
  }

  // - - - - - reads - - - - //

  // the ack payload arrives decoded and typed by the command name, see protocol/payloads.ts

  /** Battery in volts. */
  async batteryVoltage (): Promise<number | null> {
    const { payload } = await this.send('batteryVoltage', DeviceId.power, PowerCommand.getBatteryVoltage, [], Target.nordic);
    this.ctx.status.voltage = payload;
    return payload;
  }

  async batteryState (): Promise<BatteryState> {
    const { payload } = await this.send('batteryState', DeviceId.power, PowerCommand.getBatteryVoltageState, [], Target.nordic);
    this.ctx.status.battery = payload;
    return payload;
  }

  async chargerState (): Promise<ChargerState> {
    const { payload } = await this.send('chargerState', DeviceId.power, PowerCommand.getChargerState, [], Target.nordic);
    this.ctx.status.charger = payload;
    return payload;
  }

  /** Strength at the four infrared receivers: front left, front right, back right, back left. */
  async infraredReadings (): Promise<readonly number[]> {
    const { payload } = await this.send('infraredReadings', DeviceId.sensor, SensorCommand.getInfraredReadings);
    this.ctx.status.infrared = payload;
    return payload;
  }

  /** Lux, 0 in darkness, 30000 and up in direct sunlight. */
  async ambientLight (): Promise<number | null> {
    const { payload } = await this.send('ambientLight', DeviceId.sensor, SensorCommand.getAmbientLight);
    this.ctx.status.ambient = payload;
    return payload;
  }

  // - - - - - notification switches - - - - //

  async enableBatteryNotify (on: boolean): Promise<void> {
    await this.send('enableBatteryNotify', DeviceId.power, PowerCommand.enableBatteryVoltageStateNotify, [on ? 1 : 0], Target.nordic);
  }

  async enableChargerNotify (on: boolean): Promise<void> {
    await this.send('enableChargerNotify', DeviceId.power, PowerCommand.enableChargerStateNotify, [on ? 1 : 0], Target.nordic);
  }

  async enableGyroMaxNotify (on: boolean): Promise<void> {
    await this.send('enableGyroMaxNotify', DeviceId.sensor, SensorCommand.enableGyroMaxNotify, [on ? 1 : 0]);
  }

  /** Collision detection with thresholds, or off with `false`. Thresholds of 40 showed wall bumps; 100 did not. */
  async configureCollision (options: CollisionOptions | false): Promise<void> {
    if (options === false) {
      await this.send('configureCollision', DeviceId.sensor, SensorCommand.configureCollision, [0]);
      return;
    }
    const { xThreshold, yThreshold, xSpeed, ySpeed, deadTime } = { ...COLLISION_DEFAULTS, ...options };
    const method = 0x01;
    await this.send('configureCollision', DeviceId.sensor, SensorCommand.configureCollision, [method, xThreshold, xSpeed, yThreshold, ySpeed, deadTime]);
  }

  /** Listen for robot-to-robot infrared messages on all channels, or stop. */
  async listenInfrared (on: boolean): Promise<void> {
    await this.send('listenInfrared', DeviceId.sensor, SensorCommand.listenInfraredMessages, on ? [255, 255, 255, 255, 255] : [0]);
  }

  /** Streaming mask and interval. Interval 0 or mask 0 stops the stream. `motion` does the bookkeeping. */
  async setStreamingMask (intervalMs: number, mask: number): Promise<void> {
    await this.send('sensorMask', DeviceId.sensor, SensorCommand.setStreamingMask, [
      (intervalMs >> 8) & 0xff, intervalMs & 0xff,
      0,
      (mask >>> 24) & 0xff, (mask >>> 16) & 0xff, (mask >>> 8) & 0xff, mask & 0xff,
    ]);
  }

  /** The extended mask carries the gyro; its floats follow the normal groups in every sample. */
  async setStreamingMaskExtended (mask: number): Promise<void> {
    await this.send('sensorMaskExtended', DeviceId.sensor, SensorCommand.setStreamingMaskExtended, [
      (mask >>> 24) & 0xff, (mask >>> 16) & 0xff, (mask >>> 8) & 0xff, mask & 0xff,
    ]);
  }

  /**
   * The base mask starts and stops the stream; the extended mask only adds
   * the gyro to each sample. Samples sent while the two disagree carry the
   * base groups only, 40 bytes, and the motion stream drops them. So on a
   * start the extended mask goes first, and a stop sends the base mask
   * alone and leaves the extended mask for the next start. Sleep wipes both,
   * see `reapply`.
   */
  async setStreamingMasks (intervalMs: number, mask: number, extended: number): Promise<void> {
    if (mask !== 0 && extended !== this.extendedApplied) {
      await this.setStreamingMaskExtended(extended);
      this.extendedApplied = extended;
    }
    await this.setStreamingMask(intervalMs, mask);
  }

  private extendedApplied = 0;

}
