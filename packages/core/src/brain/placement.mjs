// Placement test: one camera frame finds both Bolts, the partition's ends lay
// the frame on the plan, a spot about a metre from one Bolt with nothing in
// between is chosen, and that Bolt drives there in short gentle legs, a frame
// after each, until the camera has it within 10 cm. A Bolt is found as the
// blob that lights up when its matrix and LEDs go white (utils/camera.mjs).
//
// The locator's axes on the floor are unknown until the Bolt has moved: the
// first leg goes 12 cm straight ahead, and the camera's displacement against
// the locator's gives phi, the plan heading minus the locator heading. The
// later legs steer by the camera; the first leg's phi predicts where the
// locator says the Bolt is, and more than 30 cm off the camera aborts.
//
//   BRIDGE_HOST=192.168.5.2 npx tsx packages/core/src/brain/placement.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { Bolt, mod360 } from '@bolt/core';
import { SocketTransport, portFor } from '@bolt/node-socket';
import { cam, frameAfter, partitionEnds, similarity, litBlob } from './utils/camera.mjs';

const host     = process.env.BRIDGE_HOST ?? '127.0.0.1';
const NAMES    = ['SB-9129', 'SB-11DF'];
const REACH    = 100;  // cm from the Bolt to the spot
const TOL      = 8;    // cm by the camera that ends the drive, inside the asked 10
const FIRST    = 12;   // cm of the first leg, straight ahead
const LEG      = 25;   // cm, longest leg
const WANT     = 15;   // cm/s, rollToPoint's top wanted speed; its default is 30
const MAX_LEGS = 12;
const OFF_CM   = 30;   // locator against camera that aborts
const WHITE    = [255, 255, 255];
const BLACK    = [0, 0, 0];
const OUT      = new URL('./docs/placement.md', import.meta.url);
const COLORS   = { console: '#999', plot: 'gray', backcolor: '#ccc', log: '#ccc', front: [10, 0, 0], back: [5, 5, 5], black: [0, 0, 0], matrix: [30, 240, 30] };

const lines = [];
const note  = (s) => { console.log(s); lines.push(s); };
const wait  = (ms) => new Promise((r) => setTimeout(r, ms));
const r1    = (v) => Math.round(v * 10) / 10;
const pt    = (p) => `(${r1(p.x)}, ${r1(p.y)})`;
const dist  = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rad   = (d) => d * Math.PI / 180;
const deg   = (r) => r * 180 / Math.PI;
/** Headings clockwise from the top: on the plan y points down, in the locator +y is 0. */
const planHeading = (v) => mod360(deg(Math.atan2(v.x, -v.y)));
const locHeading  = (v) => mod360(deg(Math.atan2(v.x, v.y)));
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });

mkdirSync('frames', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const save  = (f, label) => writeFileSync(`frames/placement-${stamp}-${label}.jpg`, f.jpeg);

// ---- the plan: what the path must clear, room frame cm ----
const PARTITION = [{ x0: 0, x1: 151, y0: 285.5, y1: 304.5 }, { x0: 294, x1: 440, y0: 285.5, y1: 304.5 }];
const DANGER    = [{ x0: 421, x1: 481, y0: 0, y1: 120 }, { x0: 0, x1: 160, y0: 304.5, y1: 384.5 }];
const CLEAR     = 14;  // cm kept from anything: the ball's radius 3.7 and a margin
// things on the floor the plan does not draw, as pixels of the 2026-11-04 mount: two speakers and a cushion
const FLOOR_PX  = [{ x: 300, y: 815, r: 12, what: 'left speaker' }, { x: 850, y: 808, r: 12, what: 'right speaker' }, { x: 760, y: 1260, r: 30, what: 'cushion' }];

function inRect (p, r, m) { return p.x > r.x0 - m && p.x < r.x1 + m && p.y > r.y0 - m && p.y < r.y1 + m; }

/** Why the straight path a -> b is not free, or null. */
function blocked (a, b, round, map) {
  if (b.x < 20 || b.x > 420 || b.y < 20 || b.y > 635) return 'spot off the play area';
  const px = map.toPixel(b);
  if (px.x < 60 || px.x > 1140 || px.y < 60 || px.y > 1540) return 'spot off the frame';
  const n = Math.ceil(dist(a, b));
  for (let i = 0; i <= n; i++) {
    const p = { x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n };
    if (i > 10 && PARTITION.some((r) => inRect(p, r, CLEAR))) return 'partition';
    if (DANGER.some((r) => inRect(p, r, CLEAR))) return 'danger zone';
    for (const o of round) if (dist(p, o) < o.r + CLEAR) return o.what;
  }
  return null;
}

// ---- the Bolts ----
const live = new Map();   // name -> { bolt, transport, sample }
async function bringUp (name) {
  const transport = new SocketTransport(name, portFor(name), { host });
  const bolt = new Bolt(name, { colors: COLORS }, transport);
  bolt.events.on('log', (e) => { if (e.type === 'warn' || e.type === 'error' || e.type === 'fatal') note(`- ${name} log ${e.type}: ${e.subtype}`); });
  await transport.connect();
  const entry = { bolt, transport, sample: null, release: null };
  live.set(name, entry);
  await bolt.lifecycle.takeover();
  await bolt.lifecycle.reset(true);   // sleep and wake: heading and locator frames together, position 0
  bolt.actuators.matrix.hold('placement');
  await light(entry, false);
  entry.release = await bolt.sensors.motion.subscribe((s) => { entry.sample = s; });
  note(`- ${name}: battery state ${bolt.status.battery}, ${bolt.status.voltage ?? '?'} V`);
  if (bolt.status.battery >= 2) throw new Error(`${name} battery low`);
  return entry;
}

/** The locator once still, cm, a fresh sample. */
async function locator (entry) {
  await entry.bolt.navigation.waitForStill(entry.bolt.motion);
  await wait(300);
  const s = entry.sample;
  return { x: s.locator.positionX, y: s.locator.positionY, yaw: s.angles.yaw };
}

/** Matrix and both LEDs white, or all dark. */
async function light (entry, on) {
  const { matrix, led } = entry.bolt.actuators;
  await led.set(on ? WHITE : BLACK, on ? WHITE : BLACK);
  if (on) await matrix.fill(0, 0, 7, 7, WHITE, 'placement');
  else await matrix.clear('placement');
}

/** Where the camera sees the Bolt, in pixels: lit against a frame with it dark. */
async function see (entry, label, dark = null) {
  if (!dark) { await light(entry, false); dark = await frameAfter(Date.now()); }
  await light(entry, true);
  const lit = await frameAfter(Date.now());
  await light(entry, false);
  save(lit, label);
  return litBlob(lit, dark);
}

let question = null;
try {
  note(`# Placement test ${new Date().toISOString()}`);
  note('');
  note(`Bridge ${host}. Frames under frames/placement-${stamp}-*.jpg.`);
  note('');
  note(`- camera on: ${(await cam('on')).text}`);
  for (const name of NAMES) await bringUp(name);

  // ---- one dark frame: the landmarks; then each Bolt lit in turn against it ----
  const dark = await frameAfter(Date.now());
  save(dark, 'dark');
  const ends = partitionEnds(dark);
  const map  = similarity(ends.left, ends.right);
  const gap  = dist(ends.left, ends.right);
  note(`- partition ends in pixels: left ${pt(ends.left)}, right ${pt(ends.right)}, ${r1(gap)} px apart; ${r1(map.cmPerPx)} cm/px, frame turned ${r1(map.deg)}° to the plan`);
  note(`- partition top's width by the frame: left ${r1((ends.left.bottom - ends.left.top) * map.cmPerPx)} cm, right ${r1((ends.right.bottom - ends.right.top) * map.cmPerPx)} cm; the plan says 19`);
  if (gap < 400 || gap > 650 || Math.abs(map.deg) > 10) throw new Error('landmarks implausible');

  const where = {};
  for (const name of NAMES) {
    const blob = await see(live.get(name), `find-${name}`, dark);
    if (!blob.found) { question = `${name} not found in the frame (rise ${blob.rise})`; throw new Error(question); }
    where[name] = map.toPlan(blob);
    note(`- ${name} seen at pixel ${pt(blob)}, rise ${blob.rise}, ${blob.n} px: plan ${pt(where[name])}`);
  }
  note(`- the Bolts ${r1(dist(where[NAMES[0]], where[NAMES[1]]))} cm apart by the camera`);

  // ---- the spot: a metre down or up the plan from a Bolt, the path clear ----
  const round = FLOOR_PX.map((o) => ({ ...map.toPlan(o), r: o.r, what: o.what }));
  let name = null, spot = null;
  for (const n of NAMES) {
    const other = NAMES.find((m) => m !== n);
    for (const dir of [{ y: 1, label: 'down' }, { y: -1, label: 'up' }]) {
      const s = { x: where[n].x, y: where[n].y + dir.y * REACH };
      const why = blocked(where[n], s, [...round, { ...where[other], r: 4, what: other }], map);
      note(`- candidate ${n} ${dir.label} to ${pt(s)}: ${why ?? 'free'}`);
      if (!why && !spot) { name = n; spot = s; }
    }
  }
  if (!spot) throw new Error('no free spot');
  note(`- chosen: ${name} to ${pt(spot)}, pixel ${pt(map.toPixel(spot))}`);

  // ---- the drive ----
  const entry = live.get(name);
  const { bolt } = entry;
  const loc0 = await locator(entry);
  const cam0 = where[name];
  note(`- start: camera ${pt(cam0)}, locator ${pt(loc0)} cm, yaw ${r1(loc0.yaw)}°`);
  note('');
  note('| leg | locator heading ° | asked cm | locator after | moved by locator cm | camera after | moved by camera cm | to spot cm | locator predicts | off cm |');
  note('|---|---|---|---|---|---|---|---|---|---|');

  let here = cam0, loc = loc0, phi1 = null, phi = null, arrived = false;
  for (let leg = 1; leg <= MAX_LEGS; leg++) {
    const toGo = dist(here, spot);
    if (toGo <= TOL) { arrived = true; break; }
    const heading = phi === null ? mod360(-loc.yaw) : mod360(planHeading(sub(spot, here)) - phi);
    const len = phi === null ? FIRST : Math.min(LEG, toGo);
    const goal = { x: loc.x + len * Math.sin(rad(heading)), y: loc.y + len * Math.cos(rad(heading)) };
    await bolt.navigation.rollToPoint(goal, 3, WANT);
    const locNow = await locator(entry);
    const blob = await see(entry, `leg${leg}`);
    if (!blob.found) { question = `${name} not seen after leg ${leg} (rise ${blob.rise})`; throw new Error(question); }
    const camNow = map.toPlan(blob);
    const dLoc = sub(locNow, loc), dCam = sub(camNow, here);
    if (phi1 === null) {
      if (Math.hypot(dCam.x, dCam.y) < 5) { question = `${name} moved ${r1(Math.hypot(dCam.x, dCam.y))} cm by the camera on the first leg, locator ${r1(Math.hypot(dLoc.x, dLoc.y))}`; throw new Error(question); }
      phi1 = mod360(planHeading(dCam) - locHeading(dLoc));
      note(`- first leg: plan heading ${r1(planHeading(dCam))}°, locator heading ${r1(locHeading(dLoc))}°, phi ${r1(phi1)}°`);
    }
    const total = sub(locNow, loc0), tl = Math.hypot(total.x, total.y), th = rad(locHeading(total) + phi1);
    const predicted = { x: cam0.x + tl * Math.sin(th), y: cam0.y - tl * Math.cos(th) };
    const off = dist(predicted, camNow);
    phi = mod360(planHeading(sub(camNow, cam0)) - locHeading(total));
    note(`| ${leg} | ${r1(heading)} | ${r1(len)} | ${pt(locNow)} | ${r1(Math.hypot(dLoc.x, dLoc.y))} | ${pt(camNow)} | ${r1(Math.hypot(dCam.x, dCam.y))} | ${r1(dist(camNow, spot))} | ${pt(predicted)} | ${r1(off)} |`);
    if (off > OFF_CM) { question = `${name} is ${r1(off)} cm from where its locator says after leg ${leg}`; throw new Error(question); }
    here = camNow; loc = locNow;
  }
  if (!arrived && dist(here, spot) <= TOL) arrived = true;
  note('');
  note(`- end: camera ${pt(here)}, ${r1(dist(here, spot))} cm from the spot; locator ${pt(loc)} cm, yaw ${r1(loc.yaw)}°; phi from the whole drive ${r1(phi ?? NaN)}°`);
  note(`- ${arrived ? 'arrived' : `not arrived after ${MAX_LEGS} legs`}`);
} catch (e) {
  note(`- ERROR: ${e instanceof Error ? e.message : e}`);
  for (const { bolt } of live.values()) await bolt.lifecycle.fullstop().catch(() => {});
} finally {
  for (const [n, { bolt, transport, release }] of live) {
    try { await bolt.actuators.motor.off(); } catch (e) { note(`- ${n} motors off failed: ${e}`); }
    if (question) await bolt.lifecycle.sleep().catch(() => {});
    try { if (release) await release(); } catch { /* the socket goes next */ }
    transport.close();
  }
  note(`- stop: motors off; ${question ? 'Bolts sent to sleep; ' : ''}let go: sockets closed`);
  note(`- camera off: ${(await cam('off').catch((e) => ({ text: String(e) }))).text}`);
  if (question) note(`- QUESTION: ${question}`);
  writeFileSync(OUT, lines.join('\n') + '\n');
  await wait(300);
  process.exit(0);
}
