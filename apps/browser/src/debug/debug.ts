import { Logger } from '../components/logger/logger';
import { tracker } from '../tracking/tracker';
import { Bolts } from '../bolts';
import { Bolt } from '@bolt/core';
import { tiltStep } from './tiltstep';

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

/** Current camera position of a Bolt in floor centimetres of the pad frame, or null. */
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
 * The heading that drives the floor frame's +y for this connection, from one
 * leg measured by the camera, driven on the current heading. Speed 70 for
 * 0.9 s is about 25 cm on the mat; a leg under 5 cm (wedged) or over 40 cm
 * (lost track) is rejected and tried once more.
 */
export async function calibrateHeading (name?: string) {
  const b = bolt(name);
  const heading = b.status.heading;
  const legs: { heading: number, cm: number, direction: number, used: boolean }[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const p0 = await waitFor(name);
    if (!p0) throw new Error('not tracked');
    await drive(heading, 70, 900, name);
    const p1 = await waitFor(name);
    if (!p1) throw new Error('lost after the leg');
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], cm = Math.hypot(dx, dy);
    // floor direction, clockwise from +y seen from above, like the Bolt's heading
    const direction = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    const used = cm >= 5 && cm <= 40;
    legs.push({ heading: Math.round(heading), cm: Math.round(cm), direction: Math.round(direction), used });
    if (!used) continue;
    const hy = ((heading - direction) % 360 + 360) % 360;
    tracker.headingForY = hy;
    Logger.info(b, `debug: heading for +y is ${Math.round(hy)} from a ${Math.round(cm)} cm leg`);
    return { headingForY: Math.round(hy), legs };
  }
  throw new Error('no usable leg');
}

/** Drive to a floor position, in cm of the pad frame, with camera corrections. Needs the heading for +y, see calibrateHeading. */
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

export const Debug = { position, drive, calibrateHeading, goTo, headingForY: () => tracker.headingForY, tiltStep };
