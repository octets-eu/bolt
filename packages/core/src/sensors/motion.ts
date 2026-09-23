import type { Context } from '../context';
import { StreamGroup } from '../protocol/constants';
import type { StreamGroupName } from '../protocol/constants';
import type { Vec3 } from '../helpers/math';
import { float32At } from '../protocol/bytes';
import { Stream } from '../events/stream';

/** Degrees. Pitch and roll are gravity referenced; yaw is relative to the last yaw reset and drifts. */
export interface Angles { readonly pitch: number; readonly roll: number; readonly yaw: number }

/** Dead-reckoned position in cm and velocity in cm/s, in the locator frame. */
export interface Locator {
  readonly positionX: number;
  readonly positionY: number;
  readonly velocityX: number;
  readonly velocityY: number;
}

/** One streamed sample. The layout is fixed; an incomplete packet never becomes a sample. */
export interface SensorSample {
  /** Session time in ms when the sample was parsed. */
  readonly t: number;
  readonly angles: Angles;
  /** In g. */
  readonly accelerometer: Vec3;
  readonly locator: Locator;
  /** In deg/s. */
  readonly gyro: Vec3;
}

export type MotionStream = Stream<SensorSample>;

/** Every sample: orientation, accelerometer, locator, gyro. Fixed, so a sample is complete or dropped. */
export const STREAM_GROUPS: readonly StreamGroupName[] = ['orientation', 'accelerometer', 'locator', 'gyro'];
/** 13 big-endian floats: 3 angles, 3 accelerometer, 4 locator, 3 gyro. */
export const SAMPLE_BYTES = 52;
/**
 * ms between samples, the one rate every consumer gets. 20 Hz is what the
 * Sphero platform streams at; the wire format is a uint16 of milliseconds.
 */
export const SAMPLE_INTERVAL_MS = 50;

type SetMasks = (intervalMs: number, mask: number, extended: number) => Promise<void>;

/**
 * The motion stream: angles, accelerometer, locator and gyro in one sample,
 * at `SAMPLE_INTERVAL_MS`, and off when nobody holds. Every sample has one
 * layout of `SAMPLE_BYTES`; a payload of any other length is dropped and
 * logged as `incomplete sample`. Parses the raw stream, writes the status,
 * emits `sensordata`.
 */
export function motionStream (ctx: Context, setMasks: SetMasks): MotionStream {

  const stream: MotionStream = new Stream({
    key: (held) => String(held.length > 0),
    configure: async (held) => {
      const active   = held.length > 0;
      const interval = active ? SAMPLE_INTERVAL_MS : 0;
      const mask     = active ? StreamGroup.orientation | StreamGroup.accelerometer | StreamGroup.locator : 0;
      const extended = active ? StreamGroup.gyro : 0;
      await setMasks(interval, mask, extended);
      ctx.status.streaming = { active, interval, groups: active ? STREAM_GROUPS : [] };
    },
  });

  ctx.events.on('stream', ({ payload }) => {

    // seen after mask writes: the first packets can be short. Dropped, and logged as a sensor line so the session shows when.
    if (payload.length !== SAMPLE_BYTES) {
      ctx.log('event', 'sensordata', { sensordata: `incomplete sample: ${payload.length} of ${SAMPLE_BYTES} bytes` });
      return;
    }

    const f = (i: number): number => float32At(payload, i * 4) ?? 0;
    const angles:        Angles  = { pitch: f(0), roll: f(1), yaw: f(2) };
    const accelerometer: Vec3    = { x: f(3), y: f(4), z: f(5) };
    const locator:       Locator = { positionX: f(6) * 100, positionY: f(7) * 100, velocityX: f(8) * 100, velocityY: f(9) * 100 };
    const gyro:          Vec3    = { x: f(10), y: f(11), z: f(12) };
    const sample: SensorSample = { t: ctx.now(), angles, accelerometer, locator, gyro };

    const s = ctx.status;
    s.angles   = angles;
    s.accel    = accelerometer;
    s.gyro     = gyro;
    s.position = { x: locator.positionX, y: locator.positionY };
    s.velocity = { x: locator.velocityX, y: locator.velocityY };
    s.speed    = Math.hypot(locator.velocityX, locator.velocityY);
    s.buffer.push(sample);

    ctx.log('event', 'sensordata', { sensordata: sample });
    ctx.events.emit('sensordata', sample);
    stream.push(sample);

  });

  return stream;
}
