import type { Actuators } from '../actuators/actuators';
import type { Context } from '../context';
import type { Sensors } from '../sensors/sensors';
import type { Point } from '../helpers/math';
import { StabilizationIndex } from '../protocol/constants';

export interface ArchimedeanOptions {
  /** Where the spiral ends, cm from its centre. */
  radius?: number | undefined;
  /** Between two turns, cm. */
  pitch?: number | undefined;
  clockwise?: boolean | undefined;
  /** The motor's command the whole way, 0..255. */
  speed?: number | undefined;
}

export interface ArchimedeanResult {
  /** done: the spiral's end reached. budget: the time for twice its length at `budgetCmPerSec` spent first. */
  reason: 'done' | 'budget' | 'aborted';
  /** Turns of the spiral covered. */
  turns: number;
  /** Locator position at the end. */
  at: Point;
  seconds: number;
}

/**
 * Drive an Archimedean spiral outward from where the Bolt stands: the
 * locator's origin is the centre, the first step goes along the nose, the
 * turns lie `pitch` apart and the spiral ends `radius` out. A sweep of the
 * floor around a point in one move, the same on every run: for a survey of
 * what arrives where, the Bolt's senses running beside it.
 *
 * Motor commands only, its own loop: on every motion sample the spiral point
 * `lookCm` ahead of the Bolt is aimed at, at one speed; the point only moves
 * forward along the spiral. The shape is as good as the locator, which
 * drifts; whoever needs the true track takes it from outside, a camera.
 * Stabilization on before and off after. Ends on fullstop. It does not end
 * on a collision: on open floor the collision report fires from the Bolt's
 * own accelerations.
 *
 * Not measured yet: the track against the spiral asked for, and the speed
 * over the floor at the command; `lookCm` and `budgetCmPerSec` are chosen.
 */
export async function archimedean (ctx: Context, actuators: Actuators, sensors: Sensors, { radius = 80, pitch = 20, clockwise = true, speed = 30 }: ArchimedeanOptions = {}): Promise<ArchimedeanResult> {

  const lookCm         = 12;   // the point aimed at lies this far ahead
  const stepRad        = 0.02; // the point's step along the spiral
  const budgetCmPerSec = 8;    // the budget is twice the spiral's length at this speed

  const t0 = ctx.now();
  const s = ctx.motion;
  const end = 2 * Math.PI * radius / pitch, sign = clockwise ? 1 : -1;
  const budgetMs = 2 * 1000 * (Math.PI * radius * radius / pitch) / budgetCmPerSec;
  /** The spiral's point at angle `a`, locator frame: y along the nose at the start. */
  function point (a: number): Point {
    const r = pitch * a / (2 * Math.PI);
    return { x: r * Math.sin(sign * a), y: r * Math.cos(a) };
  }

  let a = 0, at: Point = { x: 0, y: 0 }, ended = false, reason: ArchimedeanResult['reason'] = 'done';
  let done = (): void => {};
  const arrived = new Promise<void>((resolve) => { done = () => { ended = true; resolve(); }; });

  ctx.log('info', `archimedean start ${JSON.stringify({ radius, pitch, clockwise, speed, lookCm, budgetMs: Math.round(budgetMs) })}`);
  await actuators.motor.stabilize(StabilizationIndex.full);
  const release = await sensors.motion.subscribe((sample) => {
    if (ended) return;
    at = { x: sample.locator.positionX, y: sample.locator.positionY };
    if (s.aborted) { reason = 'aborted'; done(); return; }
    if (ctx.now() - t0 > budgetMs) { reason = 'budget'; done(); return; }
    let q = point(a);
    while (a < end && Math.hypot(q.x - at.x, q.y - at.y) < lookCm) { a += stepRad; q = point(a); }
    if (a >= end && Math.hypot(q.x - at.x, q.y - at.y) < lookCm / 2) { done(); return; }
    actuators.motor.rollIfIdle(speed, Math.atan2(q.x - at.x, q.y - at.y) * 180 / Math.PI);
  });
  await arrived;
  await actuators.motor.stop();
  await actuators.motor.stabilize(StabilizationIndex.none);
  await release();

  const result: ArchimedeanResult = { reason, turns: Math.round(a / (2 * Math.PI) * 100) / 100, at: { x: Math.round(at.x), y: Math.round(at.y) }, seconds: Math.round((ctx.now() - t0) / 100) / 10 };
  ctx.log('info', `archimedean end ${JSON.stringify(result)}`);
  return result;

}
