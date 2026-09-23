import type { Angles, SensorSample } from '../sensors/motion';
import type { Point, Vec3 } from '../helpers/math';
import { angleDistance } from '../helpers/math';

/**
 * The motion history and the reductions over it. Whole samples, one buffer:
 * the four groups arrive in one packet with one timestamp. Sized in time,
 * since samples arrive as the Bolt sends them.
 */

/** ms of history kept; a reader's window is any part of it. */
export const BUFFER_MS = 5000;
/** Hard cap on samples, whatever the rate. */
export const BUFFER_MAX = 2000;

/**
 * Reductions over one scalar across a window. Null when the window is empty,
 * so a caller can tell "no answer" from "zero".
 */
export class Scalar {

  constructor (private readonly values: readonly number[]) {}

  get count (): number { return this.values.length; }

  get last (): number | null { return this.values.length ? this.values[this.values.length - 1]! : null; }

  get min (): number | null { return this.values.length ? Math.min(...this.values) : null; }

  get max (): number | null { return this.values.length ? Math.max(...this.values) : null; }

  get avg (): number | null {
    if (!this.values.length) return null;
    let sum = 0;
    for (const v of this.values) sum += v;
    return sum / this.values.length;
  }

  /** max - min: how far the value ranged across the window. */
  get span (): number | null {
    const lo = this.min, hi = this.max;
    return lo === null || hi === null ? null : hi - lo;
  }

}

/**
 * A scalar that wraps at 360, unwrapped from the window's first sample so
 * every reduction is sound across the wrap: 359 followed by 1 reads as a
 * turn of 2 degrees, not of 358. Values are therefore relative to where the
 * window began and may leave [0, 360) — `span` is the total range swept,
 * `last` is how far it has turned since. The current absolute value is on
 * the status itself.
 */
export class Circular extends Scalar {

  constructor (degrees: readonly number[]) {
    super(unwrap(degrees));
  }

}

function unwrap (degrees: readonly number[]): number[] {
  const out: number[] = [];
  let total = 0;
  for (let i = 0; i < degrees.length; i++) {
    if (i > 0) total += angleDistance(degrees[i - 1]!, degrees[i]!);
    out.push(total);
  }
  return out;
}

/**
 * A vector across a window. The reductions on the channel itself are over
 * the magnitude |v|, since that is the quantity a vector has; the components
 * are scalars one level down, so `gyro.max` is the fastest rotation seen and
 * `gyro.x.max` the largest x.
 */
abstract class VectorChannel {

  protected constructor (
    private readonly magnitude: Scalar,
    private readonly components: readonly Scalar[],
  ) {}

  get count (): number { return this.magnitude.count; }

  get min (): number | null { return this.magnitude.min; }

  get max (): number | null { return this.magnitude.max; }

  get avg (): number | null { return this.magnitude.avg; }

  /** max |v| - min |v|. */
  get span (): number | null { return this.magnitude.span; }

  /**
   * Diagonal of the component-wise bounding box: how far the value ranged,
   * wherever it sat. For a position that is the size of the patch the ball
   * covered, which `span` cannot say, since a circle around the origin holds
   * |v| constant.
   */
  get extent (): number | null {
    const spans = this.components.map(c => c.span);
    if (spans.some(s => s === null)) return null;
    return Math.hypot(...spans as number[]);
  }

}

/** A three component vector: accelerometer, gyro. */
export class Vec3Channel extends VectorChannel {

  readonly x: Scalar;
  readonly y: Scalar;
  readonly z: Scalar;
  readonly last: Vec3 | null;

  constructor (values: readonly Vec3[]) {
    const x = new Scalar(values.map(v => v.x));
    const y = new Scalar(values.map(v => v.y));
    const z = new Scalar(values.map(v => v.z));
    super(new Scalar(values.map(v => Math.hypot(v.x, v.y, v.z))), [x, y, z]);
    this.x = x;
    this.y = y;
    this.z = z;
    this.last = values.length ? values[values.length - 1]! : null;
  }

}

/** A two component vector in the locator frame: position, velocity. */
export class Vec2Channel extends VectorChannel {

  readonly x: Scalar;
  readonly y: Scalar;
  readonly last: Point | null;

  constructor (values: readonly Point[]) {
    const x = new Scalar(values.map(v => v.x));
    const y = new Scalar(values.map(v => v.y));
    super(new Scalar(values.map(v => Math.hypot(v.x, v.y))), [x, y]);
    this.x = x;
    this.y = y;
    this.last = values.length ? values[values.length - 1]! : null;
  }

}

/**
 * The firmware's fused attitude. A triple, but not a vector: yaw wraps and
 * pitch and roll do not, so `hypot(pitch, roll, yaw)` is not a quantity and
 * no magnitude reduction is offered. What the three do have is `tilt`.
 */
export class AnglesChannel {

  readonly pitch: Scalar;
  readonly roll:  Scalar;
  readonly yaw:   Circular;
  /** Degrees off vertical, hypot(pitch, roll); gravity referenced, so it is a tilt in motion too. */
  readonly tilt:  Scalar;
  readonly last:  Angles | null;

  constructor (values: readonly Angles[]) {
    this.pitch = new Scalar(values.map(a => a.pitch));
    this.roll  = new Scalar(values.map(a => a.roll));
    this.yaw   = new Circular(values.map(a => a.yaw));
    this.tilt  = new Scalar(values.map(a => Math.hypot(a.pitch, a.roll)));
    this.last  = values.length ? values[values.length - 1]! : null;
  }

  get count (): number { return this.pitch.count; }

}

/**
 * A slice of history and every channel over it. Built on demand, so a
 * reduction is a pass over the slice rather than state kept up to date.
 */
export class Window {

  constructor (readonly samples: readonly SensorSample[]) {}

  get count (): number { return this.samples.length; }

  /** Session time of the newest sample, null when the window is empty. */
  get newest (): number | null {
    return this.samples.length ? this.samples[this.samples.length - 1]!.t : null;
  }

  /** Session time of the oldest sample. */
  get oldest (): number | null {
    return this.samples.length ? this.samples[0]!.t : null;
  }

  /**
   * ms the window spans, oldest to newest; 0 with fewer than two samples.
   * The span is a real elapsed time even though `t` is parse time, since
   * arrival jitter shifts samples inside the window without accumulating.
   */
  get ms (): number {
    const a = this.oldest, b = this.newest;
    return a === null || b === null ? 0 : b - a;
  }

  /** ms since the newest sample. A stale window answers confidently otherwise. */
  age (now: number): number | null {
    const b = this.newest;
    return b === null ? null : now - b;
  }

  get angles ():   AnglesChannel { return new AnglesChannel(this.samples.map(s => s.angles)); }

  get accel ():    Vec3Channel   { return new Vec3Channel(this.samples.map(s => s.accelerometer)); }

  get gyro ():     Vec3Channel   { return new Vec3Channel(this.samples.map(s => s.gyro)); }

  get position (): Vec2Channel   { return new Vec2Channel(this.samples.map(s => ({ x: s.locator.positionX, y: s.locator.positionY }))); }

  get velocity (): Vec2Channel   { return new Vec2Channel(this.samples.map(s => ({ x: s.locator.velocityX, y: s.locator.velocityY }))); }

  /** cm/s from the locator, the magnitude of the velocity. */
  get speed ():    Scalar        { return new Scalar(this.samples.map(s => Math.hypot(s.locator.velocityX, s.locator.velocityY))); }

}

/**
 * The buffer itself. Reads as a window over everything it holds, and
 * `last(ms)` narrows it.
 */
export class StatusBuffer {

  /** Fixed from construction; `head` is where the next sample lands. */
  private readonly ring: (SensorSample | null)[];
  private head = 0;
  private filled = 0;

  constructor (private readonly keepMs: number = BUFFER_MS, capacity: number = BUFFER_MAX) {
    this.ring = new Array<SensorSample | null>(capacity).fill(null);
  }

  /** Overwrites the oldest. Nothing is allocated and nothing is trimmed; retention is a read. */
  push (sample: SensorSample): void {
    this.ring[this.head] = sample;
    this.head = (this.head + 1) % this.ring.length;
    if (this.filled < this.ring.length) this.filled++;
  }

  /** The newest sample, without building a window for it. */
  get newest (): SensorSample | null {
    return this.filled ? this.ring[(this.head - 1 + this.ring.length) % this.ring.length]! : null;
  }

  /**
   * The newest `ms` of history, oldest first. Fewer samples than the window
   * asks for is normal; the window says how many it holds.
   */
  last (ms: number): Window {
    const newest = this.newest;
    if (!newest) return new Window([]);
    const cutoff = newest.t - ms;
    const out: SensorSample[] = [];
    for (let back = 1; back <= this.filled; back++) {
      const sample = this.ring[(this.head - back + this.ring.length) % this.ring.length]!;
      if (sample.t < cutoff) break;
      out.push(sample);
    }
    return new Window(out.reverse());
  }

  /** Everything still inside the retention. */
  get all (): Window { return this.last(this.keepMs); }

  /** Samples inside the retention, the same as `all.count`. */
  get count (): number { return this.all.count; }

  get ms (): number { return this.all.ms; }

  age (now: number): number | null {
    const newest = this.newest;
    return newest ? now - newest.t : null;
  }

  get angles ():   AnglesChannel { return this.all.angles; }

  get accel ():    Vec3Channel   { return this.all.accel; }

  get gyro ():     Vec3Channel   { return this.all.gyro; }

  get position (): Vec2Channel   { return this.all.position; }

  get velocity (): Vec2Channel   { return this.all.velocity; }

  get speed ():    Scalar        { return this.all.speed; }

}
