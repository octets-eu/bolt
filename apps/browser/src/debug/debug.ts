import { Logger } from '../components/logger/logger';
import { tracker, MAT_BEARING, MAT_CORNERS } from '../tracking/tracker';
import { Bolts } from '../bolts';
import { Bolt } from '@bolt/core';

/**
 * Camera-based helpers for experiments and debugging only. They live here,
 * outside core, so no behavior or brain can reach camera data: the behaviors plan
 * wants positions in the log and the evaluator, never in the robot's own
 * decisions.
 */
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function bolt (name?: string): Bolt {
  const b = name ? Bolts.get(name) : Bolts.map((x: Bolt) => x)[0];
  if (!b) throw new Error('no connected Bolt');
  return b;
}

/** Current camera position of a Bolt in mat centimetres, or null. */
export function position (name?: string): [number, number] | null {
  const n = name || bolt().name;
  const t = tracker.tracks[n];
  return t && t.cm ? [t.cm[0], t.cm[1]] : null;
}

async function waitFor (name: string | undefined, tries = 10): Promise<[number, number] | null> {
  for (let i = 0; i < tries; i++) {
    const p = position(name);
    if (p) return p;
    await sleep(300);
  }
  return null;
}

export async function drive (heading: number, speed: number, ms: number, name?: string) {
  const b = bolt(name);
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    await b.actuators.motor.roll(speed, heading);
    await sleep(100);
  }
  await b.actuators.motor.stop();
  await sleep(900);
}

/**
 * The control run: the heading that drives the mat's +y for this connection,
 * from one leg measured by the camera. The leg is aimed where north and the
 * mat's compass bearing predict +y. North scatters by tens of degrees
 * (spreads of 7 to 66 over the resets of 2026-09-23), so the camera corrects
 * it and the guess's error is logged. Speed 70 for 0.9 s is about 25 cm on
 * the mat; a leg under 5 cm (wedged) or over 40 cm (lost track) is rejected
 * and tried once more.
 */
export async function calibrateHeading (name?: string) {
  const b = bolt(name);
  const north = b.status.calibration.northHeading;
  const guess = north === null ? null : (north + MAT_BEARING) % 360;
  const heading = guess ?? b.status.heading;
  const legs: { heading: number, cm: number, direction: number, used: boolean }[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const p0 = await waitFor(name);
    if (!p0) throw new Error('not tracked');
    await drive(heading, 70, 900, name);
    const p1 = await waitFor(name);
    if (!p1) throw new Error('lost after the leg');
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], cm = Math.hypot(dx, dy);
    // mat direction, clockwise from +y seen from above, like the Bolt's heading
    const direction = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    const used = cm >= 5 && cm <= 40;
    legs.push({ heading: Math.round(heading), cm: Math.round(cm), direction: Math.round(direction), used });
    if (!used) continue;
    const hy = ((heading - direction) % 360 + 360) % 360;
    const error = guess === null ? null : ((hy - guess + 540) % 360) - 180;
    tracker.headingForY = hy;
    Logger.info(b, `debug: heading for +y is ${Math.round(hy)} from a ${Math.round(cm)} cm leg` + (error === null ? ', no north' : `; north predicted ${Math.round(guess!)}, off by ${Math.round(error)}`));
    return { headingForY: Math.round(hy), guess: guess === null ? null : Math.round(guess), error: error === null ? null : Math.round(error), legs };
  }
  throw new Error('no usable leg');
}

/** Drive to a mat position with camera corrections. Needs the heading for +y, see calibrateHeading. */
export async function goTo (target: [number, number], tol = 4, tries = 4, name?: string) {
  const hy = tracker.headingForY;
  if (hy === undefined) throw new Error('heading for +y unknown');
  const log: object[] = [];
  for (let i = 0; i < tries; i++) {
    const p = await waitFor(name);
    if (!p) return { ok: false, error: 'not tracked', log };
    const dx = target[0] - p[0], dy = target[1] - p[1], dist = Math.hypot(dx, dy);
    if (dist <= tol) return { ok: true, at: p, log };
    const heading = ((hy + Math.atan2(dx, dy) * 180 / Math.PI) % 360 + 360) % 360;
    const ms = Math.round(Math.min(1800, Math.max(450, dist / 33 * 1000 + 150)));
    await drive(heading, 70, ms, name);
    log.push({ from: p.map(Math.round), heading: Math.round(heading), ms, to: (position(name) || []).map(Math.round) });
  }
  const p = position(name);
  return { ok: !!p && Math.hypot(target[0] - p[0], target[1] - p[1]) <= tol, at: p, log };
}

/** The mat centre in floor centimetres, from the tracker's calibration targets. */
export function matCenter (): [number, number] {
  const t = tracker.calibration?.targets ?? MAT_CORNERS;
  const xs = t.map(p => p[0]), ys = t.map(p => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

/**
 * Placement for a probe: drive to the mat centre by camera and turn to face
 * across the mat, along x. Needs the heading for +y. Ends
 * with the ball still, so the surface probe can start from where it faces.
 * Debug tooling: it reads the camera, which no behavior does.
 */
export async function gotoMatCenter (tol = 4, name?: string): Promise<{ ok: boolean, at: [number, number] | null, heading: number | null, reason: string, log: object[] }> {
  const b = bolt(name);
  if (!tracker.running) return { ok: false, at: null, heading: null, reason: 'tracker not running', log: [] };
  if (!await waitFor(name)) return { ok: false, at: null, heading: null, reason: 'not tracked', log: [] };
  if (tracker.headingForY === undefined) return { ok: false, at: null, heading: null, reason: 'heading for +y unknown', log: [] };
  const center = matCenter();
  const r = await goTo(center, tol, 4, name);
  if (!r.ok) return { ok: false, at: r.at ?? null, heading: null, reason: r.error ?? 'not within tolerance', log: r.log };
  const across = ((tracker.headingForY ?? 0) + 90) % 360;
  await b.actuators.motor.roll(0, across);
  await sleep(900);
  const at = position(name);
  Logger.info(b, `debug: at mat centre ${at ? at.map(Math.round).join(',') : '?'} facing across, heading ${Math.round(across)}`);
  return { ok: true, at, heading: across, reason: 'done', log: r.log };
}

export const Debug = { position, drive, calibrateHeading, goTo, gotoMatCenter, matCenter, headingForY: () => tracker.headingForY };
