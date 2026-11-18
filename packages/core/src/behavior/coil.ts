import type { Actuators } from '../actuators/actuators';
import type { Context } from '../context';
import type { Sensors } from '../sensors/sensors';
import type { Point } from '../helpers/math';
import { StabilizationIndex } from '../protocol/constants';

export interface CoilOptions {
  /** The widest loop round each cm of the line, from the start on; the line is as long as the list. The caller knows the room. */
  widths: readonly number[];
  /** The centre's travel per loop, and the most a loop grows or shrinks in a turn, cm. */
  pitch?: number | undefined;
  /** The last spiral, round the line's end: from the radius `from` in to `to`, `pitch` a turn. The widths keep the loops `from` off the end. */
  orbit?: { from: number; to: number; pitch: number } | undefined;
  /** The motor's command the whole way, 0..255. */
  speed?: number | undefined;
}

export interface CoilResult {
  /** done: the track's end reached. budget: the time for twice its length at `budgetCmPerSec` spent first. aborted: a fullstop. */
  reason: 'done' | 'budget' | 'aborted';
  /** Turns of the track covered, loops and the last spiral's alike. */
  turns: number;
  /** Locator position at the end. */
  at: Point;
  seconds: number;
}

const STEP_RAD = 0.02;   // the track's step

/**
 * The coil's track, locator frame, the origin where the Bolt stands and y
 * along its nose; the line runs from there straight back, against the nose.
 * First a spiral out round the start, to `firstCm` or the width there. Then
 * loops whose centre creeps `pitch` a turn down the line, each as wide as
 * `widths` allows where its centre is, growing or shrinking `pitch` a turn at
 * most; clockwise, a loop's first point ahead of its centre. The loops end at
 * the far point of the first one smaller than `smallCm`, or of the first
 * with its centre on the line's end. From there the last spiral runs round
 * the line's end the other way, `orbit.from` in to `orbit.to`, and once more
 * round at `orbit.to`.
 */
export function coilPath ({ widths, pitch = 20, orbit = { from: 50, to: 20, pitch: 10 } }: CoilOptions): Point[] {
  const firstCm = 50, smallCm = 25;
  const length = widths.length - 1, grow = pitch * STEP_RAD / (2 * Math.PI);
  const path: Point[] = [];
  let r = 0, along = 0, creeping = false;
  for (let a = 0; ; a += STEP_RAD) {
    const want = widths[Math.round(along)] ?? 0;
    if (r >= Math.min(firstCm, want) - 0.5) creeping = true;
    if (creeping) along = Math.min(length, along + grow);
    r += Math.max(-grow, Math.min(grow, want - r));
    path.push({ x: r * Math.sin(a), y: r * Math.cos(a) - along });
    if (a > 4 * Math.PI && (r < smallCm || along >= length) && Math.abs(a % (2 * Math.PI) - Math.PI) < STEP_RAD) break;
  }
  const turns = (orbit.from - orbit.to) / orbit.pitch + 1;
  for (let b = 0; b <= 2 * Math.PI * turns; b += STEP_RAD) {
    const rho = Math.max(orbit.to, orbit.from - orbit.pitch * b / (2 * Math.PI));
    path.push({ x: -rho * Math.sin(b), y: rho * Math.cos(b) - length });
  }
  return path;
}

/**
 * Drive the coil, `coilPath`'s track: from where the Bolt stands down the
 * line behind it in overlapping loops as wide as the floor allows, ending in
 * a spiral round the line's end. Every place between the start and the end
 * is passed several times, each time with another side toward the end: for a
 * survey of what arrives where from a sender standing on the line's end, the
 * Bolt's senses running beside it.
 *
 * Motor commands only, its own loop, as `archimedean`'s: every motion sample
 * moves the track's point `lookCm` ahead of the Bolt on, forward only, so a
 * loop crossing an earlier one is no way back, and every `rollMs` one roll
 * aims at it, at one speed; the link is left to the senses between the
 * rolls. The shape is as good as the locator, which drifts; whoever needs the
 * true track takes it from outside, a camera. Stabilization on before and
 * off after. Ends at the track's end, on its budget or on fullstop, not on a
 * collision. `lookCm`, `rollMs` and `budgetCmPerSec` are chosen, as are
 * `coilPath`'s `firstCm` and `smallCm`. Not driven yet.
 */
export async function coil (ctx: Context, actuators: Actuators, sensors: Sensors, options: CoilOptions): Promise<CoilResult> {

  const lookCm         = 12;   // the point aimed at lies this far ahead
  const rollMs         = 280;  // between two rolls: 3.6 a second, a seek's rate
  const budgetCmPerSec = 8;    // the budget is twice the track's length at this speed

  const { speed = 30 } = options;
  const path = coilPath(options), last = path.length - 1;
  let cm = 0;
  for (let k = 1; k < path.length; k++) cm += Math.hypot(path[k]!.x - path[k - 1]!.x, path[k]!.y - path[k - 1]!.y);
  const budgetMs = 2 * 1000 * cm / budgetCmPerSec;

  const t0 = ctx.now();
  const s = ctx.motion;
  let i = 0, at: Point = { x: 0, y: 0 }, ended = false, rolledAt = -Infinity, reason: CoilResult['reason'] = 'done';
  let done = (): void => {};
  const arrived = new Promise<void>((resolve) => { done = () => { ended = true; resolve(); }; });

  ctx.log('info', `coil start ${JSON.stringify({ line: options.widths.length - 1, pitch: options.pitch ?? null, orbit: options.orbit ?? null, speed, lookCm, rollMs, cm: Math.round(cm), budgetMs: Math.round(budgetMs) })}`);
  await actuators.motor.stabilize(StabilizationIndex.full);
  const release = await sensors.motion.subscribe((sample) => {
    if (ended) return;
    at = { x: sample.locator.positionX, y: sample.locator.positionY };
    if (s.aborted) { reason = 'aborted'; done(); return; }
    if (ctx.now() - t0 > budgetMs) { reason = 'budget'; done(); return; }
    let q = path[i]!;
    while (i < last && Math.hypot(q.x - at.x, q.y - at.y) < lookCm) q = path[++i]!;
    if (i === last && Math.hypot(q.x - at.x, q.y - at.y) < lookCm / 2) { done(); return; }
    if (ctx.now() - rolledAt < rollMs) return;
    rolledAt = ctx.now();
    actuators.motor.rollIfIdle(speed, Math.atan2(q.x - at.x, q.y - at.y) * 180 / Math.PI);
  });
  await arrived;
  await actuators.motor.stop();
  await actuators.motor.stabilize(StabilizationIndex.none);
  await release();

  const result: CoilResult = { reason, turns: Math.round(i * STEP_RAD / (2 * Math.PI) * 100) / 100, at: { x: Math.round(at.x), y: Math.round(at.y) }, seconds: Math.round((ctx.now() - t0) / 100) / 10 };
  ctx.log('info', `coil end ${JSON.stringify(result)}`);
  return result;

}
