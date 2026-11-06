// One seek: the sender sends the ladder, the seeker runs the brain, until
// both report a collision within 300 ms of each other (the tag rule of
// experiments/seek-to-collision.ts), the time limit, or a runaway. The camera
// measures the start and end distance centre to centre; a ledger row goes to
// docs/ledger.md, a per-second trace to the console.
//
//   BRIDGE_HOST=192.168.5.2 npx tsx packages/core/src/brain/seek.mjs [seeker] [--move]
//
// The trace goes to frames/<stamp>-trace.txt.
//
// --move: the sender rolls a slow square while the seeker seeks (the extra).

import { appendFileSync } from 'node:fs';
import { StabilizationIndex } from '@bolt/core';
import { NAMES, bringUp, locate, letGo, cam, wait, r1, pt, dist, headingOf, stamp } from './utils/rig.mjs';
import { Brain } from './connectome/brain.mjs';
import { MatrixView } from './utils/matrix-view.mjs';

const seekerName = process.argv.slice(2).find((a) => NAMES.includes(a)) ?? NAMES[0];
const senderName = NAMES.find((n) => n !== seekerName);
const moving     = process.argv.includes('--move');
const TAG_MS     = 300;                     // both collision reports within this: found
const THRESHOLDS = { xThreshold: 20, yThreshold: 20 };   // quiet at rest, fires on a slow contact
const SECONDS_PER_M = 30;                   // the goal; the run gets 1.5 times it
const LEDGER     = new URL('./docs/ledger.md', import.meta.url);
const TRACE      = `frames/${stamp}-trace.txt`;   // the per-second trace, outside the console

const entries = [];
let result = 'error', note = '';
try {
  console.log(`camera ${(await cam('on')).text}`);
  for (const n of [seekerName, senderName]) entries.push(await bringUp(n));
  const [seeker, sender] = entries;
  for (const e of entries) if (e.bolt.status.battery >= 2) throw new Error(`${e.name} battery state ${e.bolt.status.battery}`);
  const start = await locate(entries, 'start');
  const d0 = dist(start.at[seekerName], start.at[senderName]);
  console.log(`seeker ${seekerName} ${pt(start.at[seekerName])}, sender ${senderName} ${pt(start.at[senderName])}, ${r1(d0)} cm`);
  const limitS = Math.max(20, 1.5 * SECONDS_PER_M * d0 / 100);

  // the tag
  let finish; const ended = new Promise((r) => { finish = r; });
  const hit = { [seekerName]: -Infinity, [senderName]: -Infinity };
  for (const e of entries) {
    await e.bolt.sensors.collision.subscribe(() => {
      hit[e.name] = Date.now();
      if (Math.abs(hit[seekerName] - hit[senderName]) <= TAG_MS) finish('found');
    }, THRESHOLDS);
  }

  // the sender: the ladder, and on --move a slow square, 2 s a side
  const sending = sender.bolt.communication.sendLadder('long').catch(() => finish('error'));
  let pattern = null;
  if (moving) {
    pattern = (async () => {
      await sender.bolt.actuators.motor.stabilize(StabilizationIndex.full);
      for (let k = 0; !sender.bolt.motion.aborted; k++) {
        for (let i = 0; i < 20 && !sender.bolt.motion.aborted; i++) { await sender.bolt.actuators.motor.roll(22, (k % 4) * 90); await wait(100); }
      }
    })().catch(() => {});
  }
  await wait(1000);

  // the seeker
  const view = new MatrixView(seeker.bolt);
  await view.start();
  let lastTrace = 0, t0 = null;
  const loc0 = { x: seeker.sample.locator.positionX, y: seeker.sample.locator.positionY };
  const brain = new Brain(seeker.bolt, {
    onLadder: (range) => { console.log(`  ladder -> ${range}`); void sender.bolt.communication.switchLadder(range); },
    onRoll: (b) => view.update(b),
    onStep: (b) => {
      t0 ??= Date.now();
      const now = Date.now();
      const loc = { x: seeker.sample.locator.positionX, y: seeker.sample.locator.positionY };
      if (dist(loc, loc0) > d0 + 50) finish('runaway');
      if (now - lastTrace >= 1000) {
        lastTrace = now;
        const ring = b.ring(), st = b.obs.stats;
        appendFileSync(TRACE, `${r1((now - t0) / 1000)}s ${b.cmd.mode} ring ${Math.round(ring.angle)}° len ${ring.length.toFixed(2)} max ${Math.max(...ring.rates).toFixed(2)} ax ${b.net.get("M_AXIS").toFixed(2)} carrier ${b.obs.carrier} ${b.ladder} frames ${st.frames} reads ${st.landed}/${st.reads} named ${st.named} flooded ${st.flooded} hd ${Math.round(headingOf(seeker))} v ${Math.round(b.cmd.speed)} app ${b.net.get('IR_APPROACH').toFixed(2)} rec ${b.net.get('IR_RECEDE').toFixed(2)}\n`);
      }
    },
  });
  await brain.start();
  const timer = setTimeout(() => finish('time'), limitS * 1000);
  result = await ended;
  clearTimeout(timer);
  const seconds = (Date.now() - (t0 ?? Date.now())) / 1000;
  await brain.stop();
  sender.bolt.abortMotion();
  await sender.bolt.actuators.motor.off();
  await Promise.allSettled([sending, pattern]);
  await view.stop();
  console.log(`stats ${JSON.stringify(brain.obs.stats)}`);
  console.log(`result ${result} after ${r1(seconds)} s; modes ${JSON.stringify(brain.modes)}; gap ${r1(Math.abs(hit[seekerName] - hit[senderName]))} ms`);

  await wait(1500);
  const end = await locate(entries, 'end');
  const d1 = dist(end.at[seekerName], end.at[senderName]);
  console.log(`end: seeker ${pt(end.at[seekerName])}, sender ${pt(end.at[senderName])}, ${r1(d1)} cm`);
  const goal = SECONDS_PER_M * d0 / 100;
  note = `| ${new Date().toISOString().slice(0, 16)} | ${seekerName} | ${senderName}${moving ? ' moving' : ''} | ${r1(d0)} | camera, lit blobs | ${result} | ${r1(seconds)} | ${r1(goal)} | ${result === 'found' && seconds < goal ? 'yes' : 'no'} | ${r1(d1)} | ${brain.obs.stats.frames} frames, ${brain.obs.stats.named}/${brain.obs.stats.reads} reads named |`;
  appendFileSync(LEDGER, note + '\n');
} catch (err) {
  console.log(`ERROR ${err.message}`);
} finally {
  await letGo(entries);
  console.log(`camera ${(await cam('off')).text}`);
  process.exit(0);
}
