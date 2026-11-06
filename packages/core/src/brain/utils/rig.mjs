// The rig for brain programs: the Bolts over the bridge, lit for the camera,
// found on the plan, driven in short time-capped legs, slept and let go.
// Positions are the room frame of docs/floor-plan.svg, cm; headings clockwise.
// The locator drifts (questions.md, 2026-11-04): the camera is the position,
// a leg is capped by time, nothing here reads the locator for position.

import { mkdirSync, writeFileSync } from 'node:fs';
import { Bolt, mod360, StabilizationIndex } from '@bolt/core';
import { SocketTransport, portFor } from '@bolt/node-socket';
import { cam, frameAfter, partitionEnds, similarity, litBlob } from './camera.mjs';

export const host  = process.env.BRIDGE_HOST ?? '127.0.0.1';
export const NAMES = ['SB-9129', 'SB-11DF'];
export const wait  = (ms) => new Promise((r) => setTimeout(r, ms));
export const r1    = (v) => Math.round(v * 10) / 10;
export const pt    = (p) => `(${r1(p.x)}, ${r1(p.y)})`;
export const dist  = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** Plan heading of a plan vector: clockwise from the top of the sheet, y down. */
export const planHeading = (v) => mod360(Math.atan2(v.x, -v.y) * 180 / Math.PI);

const WHITE  = [255, 255, 255], BLACK = [0, 0, 0];
const COLORS = { console: '#999', plot: 'gray', backcolor: '#ccc', log: '#ccc', front: [10, 0, 0], back: [5, 5, 5], black: [0, 0, 0], matrix: [30, 240, 30] };

mkdirSync('frames', { recursive: true });
export const stamp = new Date().toISOString().replace(/[:.]/g, '-');
export const saveFrame = (f, label) => writeFileSync(`frames/${stamp}-${label}.jpg`, f.jpeg);

/** Connect, take over, sleep and wake (heading 0 = the Bolt's front), hold the motion stream: { bolt, transport, sample }. */
export async function bringUp (name, log = console.log, tries = 2) {
  try { return await bringUpOnce(name, log); } catch (err) {
    if (tries <= 1) throw err;
    log(`- ${name}: ${err.message}, once more in 3 s`);   // a Bolt slept just before answered badDeviceId (2026-11-06)
    await wait(3000);
    return bringUp(name, log, tries - 1);
  }
}

async function bringUpOnce (name, log) {
  const transport = new SocketTransport(name, portFor(name), { host });
  const bolt = new Bolt(name, { colors: COLORS }, transport);
  bolt.events.on('log', (e) => { if (e.type === 'error' || e.type === 'fatal') log(`- ${name} ${e.type}: ${e.subtype}`); });
  await transport.connect();
  try { await bolt.lifecycle.takeover(); } catch (err) { transport.close(); throw err; }
  await bolt.lifecycle.reset(true);
  const entry = { name, bolt, transport, sample: null };
  await bolt.sensors.motion.subscribe((s) => { entry.sample = s; });
  await bolt.sensors.batteryState();
  return entry;
}

/** Heading the Bolt faces in its heading frame, from the last sample: minus the yaw. */
export const headingOf = (entry) => mod360(-(entry.sample?.angles.yaw ?? 0));

export async function light (entry, on) {
  const { matrix, led } = entry.bolt.actuators;
  await led.set(on ? WHITE : BLACK, on ? WHITE : BLACK);
  if (on) await matrix.fill(0, 0, 7, 7, WHITE);
  else await matrix.clear();
}

/** Each Bolt lit in turn against one dark frame: { map, at: { name: plan point } }. Throws when one is not seen. */
export async function locate (entries, label = 'find') {
  for (const e of entries) await light(e, false);
  const dark = await frameAfter(Date.now());
  const ends = partitionEnds(dark);
  const map  = similarity(ends.left, ends.right);
  if (Math.abs(map.deg) > 10 || map.cmPerPx < 0.2 || map.cmPerPx > 0.4) throw new Error('camera: landmarks implausible');
  const at = {};
  for (const e of entries) {
    await light(e, true);
    const lit = await frameAfter(Date.now());
    await light(e, false);
    saveFrame(lit, `${label}-${e.name}`);
    const blob = litBlob(lit, dark);
    if (!blob.found) throw new Error(`camera: ${e.name} not seen (rise ${blob.rise})`);
    at[e.name] = map.toPlan(blob);
  }
  return { map, at };
}

/** Roll on `heading` at `speed` (0..255) for `ms`, a roll every 100 ms, then stop and let the ball settle. */
export async function leg (entry, heading, speed, ms) {
  const { motor } = entry.bolt.actuators;
  await motor.stabilize(StabilizationIndex.full);
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { await motor.roll(speed, heading); await wait(100); }
  await motor.roll(0, heading);
  await wait(800);
  await motor.stabilize(StabilizationIndex.none);
}

/** Motors off, sleep, close: the stop. */
export async function letGo (entries) {
  for (const e of entries) {
    try { await e.bolt.actuators.motor.off(); await e.bolt.lifecycle.sleep(); } catch { /* the socket close stops it anyway */ }
    e.transport.close();
  }
}

export { cam };
