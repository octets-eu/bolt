// Motion test, one turn in place and back, no rolling: one Bolt up through the
// bridge, woken by takeover, heading and locator read at rest, rotate 90
// clockwise, read, rotate back to the start heading, read, motors off, let go.
// The turn is gentle: rotate's lead is 20 degrees, not its default 120. A
// watchdog fullstops if the locator leaves the start by more than 5 cm. The
// readings go to brain/docs/motion.md.
//
//   BRIDGE_HOST=192.168.5.2 npx tsx packages/core/src/brain/motion.mjs [SB-9129]

import { writeFileSync } from 'node:fs';
import { Bolt, angleDistance, mod360 } from '@bolt/core';
import { SocketTransport, portFor } from '@bolt/node-socket';

const host   = process.env.BRIDGE_HOST ?? '127.0.0.1';
const name   = process.argv[2] ?? 'SB-9129';
const LEAD   = 20;   // degrees the command runs ahead of the yaw; small is slow
const MAX_CM = 5;    // locator travel that aborts the test
const OUT    = new URL('./docs/motion.md', import.meta.url);
const COLORS = { console: '#999', plot: 'gray', backcolor: '#ccc', log: '#ccc', front: [10, 0, 0], back: [5, 5, 5], black: [0, 0, 0], matrix: [30, 240, 30] };

const lines = [];
const note  = (s) => { console.log(s); lines.push(s); };
const wait  = (ms) => new Promise((r) => setTimeout(r, ms));
const r1    = (v) => Math.round(v * 10) / 10;

const transport = new SocketTransport(name, portFor(name), { host });
const bolt = new Bolt(name, { colors: COLORS }, transport);
bolt.events.on('log', (e) => { if (e.type === 'warn' || e.type === 'error' || e.type === 'fatal') note(`- log ${e.type}: ${e.subtype}`); });

/** Mean of the samples over half a second once still: heading = -yaw, locator in cm. */
let samples = [];
async function reading (label) {
  await bolt.navigation.waitForStill(bolt.motion);
  samples = [];
  await wait(500);
  const n = samples.length;
  const yaw = samples.reduce((a, s) => a + s.angles.yaw, 0) / n;
  const x   = samples.reduce((a, s) => a + s.locator.positionX, 0) / n;
  const y   = samples.reduce((a, s) => a + s.locator.positionY, 0) / n;
  const r = { label, yaw: r1(yaw), heading: r1(mod360(-yaw)), x: r1(x), y: r1(y), n };
  note(`| ${label} | ${r.yaw} | ${r.heading} | ${r.x} | ${r.y} | ${n} |`);
  return r;
}

let release = null, maxTravel = 0, aborted = false, origin = null;
try {
  note(`# Motion test ${new Date().toISOString()}`);
  note('');
  note(`Bolt ${name} (port ${portFor(name)}), bridge ${host}. Turn in place by navigation.rotate, lead ${LEAD} degrees, tolerance 2; watchdog at ${MAX_CM} cm locator travel.`);
  note('');
  await transport.connect();
  await bolt.lifecycle.takeover();
  note(`- takeover done: battery state ${bolt.status.battery}, voltage ${bolt.status.voltage ?? '?'} V, awake ${bolt.status.awake}`);

  release = await bolt.sensors.motion.subscribe((s) => {
    samples.push(s);
    if (!origin) return;
    const d = Math.hypot(s.locator.positionX - origin.x, s.locator.positionY - origin.y);
    maxTravel = Math.max(maxTravel, d);
    if (d > MAX_CM && !aborted) { aborted = true; note(`- WATCHDOG: locator ${r1(d)} cm from start, fullstop`); void bolt.lifecycle.fullstop(); }
  });
  await bolt.events.once('sensordata', { timeoutMs: 2000 });

  note('');
  note('| reading | yaw ° | heading ° (= -yaw) | locator x cm | locator y cm | samples |');
  note('|---|---|---|---|---|---|');
  const a = await reading('1 at rest');
  origin = { x: a.x, y: a.y };
  // rotate counts from the commanded heading; lay it on the measured one
  bolt.status.heading = Math.round(a.heading);

  const t1 = Date.now();
  const turn1 = await bolt.navigation.rotate(90, 2, LEAD);
  const ms1 = Date.now() - t1;
  const b = await reading('2 after +90');

  const back = angleDistance(b.heading, a.heading);
  bolt.status.heading = Math.round(b.heading);
  const t2 = Date.now();
  const turn2 = aborted ? null : await bolt.navigation.rotate(back, 2, LEAD);
  const ms2 = Date.now() - t2;
  const c = await reading('3 back at start');

  note('');
  note(`- turn 1: rotate(90) ${ms1} ms, missing ${turn1.error}°, ${turn1.rounds} correction rounds; measured ${r1(angleDistance(a.heading, b.heading))}°`);
  note(turn2 ? `- turn 2: rotate(${r1(back)}) ${ms2} ms, missing ${turn2.error}°, ${turn2.rounds} correction rounds; end ${r1(angleDistance(a.heading, c.heading))}° off the start heading` : '- turn 2: skipped after the watchdog');
  note(`- locator: largest distance from the start during the test ${r1(maxTravel)} cm; end ${r1(Math.hypot(c.x - a.x, c.y - a.y))} cm from the start`);
} catch (e) {
  note(`- ERROR: ${e instanceof Error ? e.message : e}`);
} finally {
  try { await bolt.actuators.motor.off(); note('- stop: motors off'); } catch (e) { note(`- stop failed: ${e}`); }
  try { if (release) await release(); } catch { /* the socket goes next */ }
  transport.close();
  note(`- let go: socket closed`);
  writeFileSync(OUT, lines.join('\n') + '\n');
  await wait(300);
  process.exit(0);
}
