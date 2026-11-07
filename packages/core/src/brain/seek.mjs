// One seek: the sender sends the ladder, the seeker runs the brain, until
// both report a collision within 300 ms of each other (the tag rule of
// experiments/seek-to-collision.ts), the time limit, a runaway by the locator,
// the fence on the camera's track of the lit seeker (utils/track.mjs), or a
// stalled motion stream. The camera measures the start and end distance centre
// to centre; a ledger row goes to docs/ledger.md, a per-second trace with the
// track and every collision report to the trace file.
//
//   BRIDGE_HOST=192.168.5.2 npx tsx packages/core/src/brain/seek.mjs [seeker] [--move]
//
// The trace goes to frames/<stamp>-trace.txt.
//
// --move: the sender rolls a slow circle while the seeker seeks (the extra).

import { appendFileSync } from 'node:fs';
import { StabilizationIndex } from '@bolt/core';
import { NAMES, bringUp, locate, letGo, cam, wait, r1, pt, dist, headingOf, stamp } from './utils/rig.mjs';
import { Brain } from './connectome/brain.mjs';
import { MatrixView } from './utils/matrix-view.mjs';
import { track } from './utils/track.mjs';
import { LadderSender } from './utils/ladder.mjs';

const seekerName = process.argv.slice(2).find((a) => NAMES.includes(a)) ?? NAMES[0];
const senderName = NAMES.find((n) => n !== seekerName);
const moving     = process.argv.includes('--move');
const TAG_MS     = 300;                     // both collision reports within this: found
// no speed terms: with the firmware's, a seeker pressing on the sender for 20 s reported nothing
// (2026-11-06). Without, the seeker also fires on its own casting; at 20 it still missed soft
// contacts the sender felt. The standing sender, at 10, fires on contact only (15 missed a graze
// the seeker felt at 27), so the 300 ms pairing still means a contact
const THRESHOLDS = { seeker: { xThreshold: 15, yThreshold: 15, xSpeed: 0, ySpeed: 0 }, sender: { xThreshold: 10, yThreshold: 10, xSpeed: 0, ySpeed: 0 },
  rolling: { xThreshold: 20, yThreshold: 20 } };   // a rolling sender keeps the speed term, or its own motion would pair with the seeker's
const SECONDS_PER_M = 30;                   // the goal; the run gets 1.5 times it
const LEDGER     = new URL('./docs/ledger.md', import.meta.url);
const TRACE      = `frames/${stamp}-trace.txt`;   // the per-second trace, outside the console
// the fence: the plan's no-go parts, plan cm, with margin for the stream's lag (3 to 4 s on
// 2026-11-06: a fence at x 170 stopped a seeker at x 78): the cables (danger-2) and the left
// partition, the cabinet (furniture-3), the chest and the right partition's end, furniture-2, the walls
const NO_GO = [
  { x0: -99, x1: 195, y0: 260, y1: 420 }, { x0: 205, x1: 999, y0: 462, y1: 999 }, { x0: 285, x1: 999, y0: -99, y1: 315 },
  { x0: 350, x1: 999, y0: -99, y1: 999 }, { x0: -99, x1: 30, y0: -99, y1: 999 }, { x0: -99, x1: 999, y0: -99, y1: 40 },
];
const inside     = (p) => !NO_GO.some((r) => p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1);

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
  let lastTrace = 0, t0 = null, lastStep = 0;   // t0: the brain's first step, its first motion
  let finish; const ended = new Promise((r) => { finish = r; });
  // when the reports arrive; the notification's firmware timestamp reads 0 (2026-11-06)
  const hit = { [seekerName]: -Infinity, [senderName]: -Infinity };
  for (const e of entries) {
    await e.bolt.sensors.collision.subscribe((c) => {
      hit[e.name] = Date.now();
      appendFileSync(TRACE, `  collision ${e.name} at ${r1((hit[e.name] - (t0 ?? hit[e.name])) / 1000)} s, x ${c.xMagnitude} y ${c.yMagnitude}\n`);
      if (Math.abs(hit[seekerName] - hit[senderName]) <= TAG_MS) finish('found');
    }, e === seeker ? THRESHOLDS.seeker : moving ? THRESHOLDS.rolling : THRESHOLDS.sender);
  }

  // the sender: the ladder, and on --move a slow circle
  const ladder = new LadderSender(sender.bolt, 'long', 1);
  const sending = ladder.run().catch(() => finish('error'));
  let pattern = null;
  if (moving) {
    pattern = (async () => {
      await sender.bolt.actuators.motor.stabilize(StabilizationIndex.full);
      // a slow circle, about 17 cm in radius, a roll every 500 ms, not every 100: the infrared commands
      // share the sender's link (2026-11-06). Not a square: at its corners the sender reported (y 33 to 36),
      // and one paired with the seeker's own report, a false tag 80 cm apart (2026-11-07, 10:54)
      for (let k = 0; !sender.bolt.motion.aborted; k++) { await sender.bolt.actuators.motor.roll(22, (k * 20) % 360); await wait(500); }
    })().catch(() => {});
  }
  await wait(1000);

  // the seeker, lit white for the camera's track
  await seeker.bolt.actuators.led.set([255, 255, 255], [255, 255, 255]);
  const sAt = start.at[senderName];
  const dark = { ...start.dark, gray: Buffer.from(start.dark.gray) }, sp = start.map.toPixel(sAt);
  for (let y = -30; y <= 30; y++) for (let x = -30; x <= 30; x++) {   // the sender's matrix shows the ladder: masked out
    const i = Math.round(sp.y + y) * dark.w + Math.round(sp.x + x);
    if (i >= 0 && i < dark.gray.length) dark.gray[i] = 255;
  }
  const untrack = track(dark, start.map, (p) => {
    appendFileSync(TRACE, `  cam ${r1((p.t - (t0 ?? p.t)) / 1000)}s ${pt(p)} to sender ${r1(dist(p, sAt))} cm\n`);
    if (t0 && p.t > t0 && !inside(p)) finish('fence');
  });
  const view = new MatrixView(seeker.bolt);
  await view.start();
  const loc0 = { x: seeker.sample.locator.positionX, y: seeker.sample.locator.positionY };
  const brain = new Brain(seeker.bolt, {
    onLadder: (range) => { console.log(`  ladder -> ${range}`); ladder.switch(range); },
    onRoll: (b) => view.update(b),
    onStep: (b) => {
      t0 ??= Date.now();
      const now = Date.now();
      lastStep = now;
      const loc = { x: seeker.sample.locator.positionX, y: seeker.sample.locator.positionY };
      if (dist(loc, loc0) > d0 + 100) finish('runaway');
      if (now - lastTrace >= 1000) {
        lastTrace = now;
        const ring = b.ring(), st = b.obs.stats;
        appendFileSync(TRACE, `${r1((now - t0) / 1000)}s ${b.cmd.mode} ring ${Math.round(ring.angle)}° len ${ring.length.toFixed(2)} max ${Math.max(...ring.rates).toFixed(2)} ax ${b.net.get("M_AXIS").toFixed(2)} carrier ${b.obs.carrier} ${b.ladder} frames ${st.frames} reads ${st.landed}/${st.reads} named ${st.named} flooded ${st.flooded} hd ${Math.round(headingOf(seeker))} v ${Math.round(b.cmd.speed)} app ${b.net.get('IR_APPROACH').toFixed(2)} rec ${b.net.get('IR_RECEDE').toFixed(2)}\n`);
      }
    },
  });
  await brain.start();
  const timer = setTimeout(() => finish('time'), limitS * 1000);
  // the watchdog: the seeker's motion stream once stopped mid-run and it rolled on into the cabinet
  const watchdog = setInterval(() => { if (t0 && Date.now() - lastStep > 1500) finish('stalled'); }, 250);
  result = await ended;
  clearTimeout(timer); clearInterval(watchdog);
  const seconds = (Date.now() - (t0 ?? Date.now())) / 1000;
  // the stop, each step capped: a --move run hung here with the sender still rolling (2026-11-06)
  const capped = (p) => Promise.race([Promise.resolve(p).catch(() => {}), wait(3000)]);
  await capped(brain.stop());   // the seeker first: stopped second, it rolled on 50 cm past the tag (2026-11-06)
  ladder.stop();
  sender.bolt.abortMotion();
  await capped(sender.bolt.actuators.motor.off());
  await capped(Promise.allSettled([sending, pattern]));
  await capped(view.stop());
  await capped(untrack());
  console.log(`stats ${JSON.stringify(brain.obs.stats)}`);
  console.log(`result ${result} after ${r1(seconds)} s; modes ${JSON.stringify(brain.modes)}; gap ${r1(Math.abs(hit[seekerName] - hit[senderName]))} ms`);

  await wait(1500);
  const end = await locate(entries, 'end');
  const d1 = dist(end.at[seekerName], end.at[senderName]);
  console.log(`end: seeker ${pt(end.at[seekerName])}, sender ${pt(end.at[senderName])}, ${r1(d1)} cm`);
  const goal = SECONDS_PER_M * d0 / 100;
  note = `| ${new Date().toISOString().slice(0, 16)} | ${seekerName} | ${senderName}${moving ? ' moving' : ''} | ${r1(d0)} | camera, lit blobs | ${result} | ${r1(seconds)} | ${r1(goal)} | ${result === 'found' && seconds < goal ? 'yes' : 'no'} | ${r1(d1)} | ${brain.obs.stats.frames} frames, ${brain.obs.stats.named}/${brain.obs.stats.reads} reads named; tag gap ${r1(Math.abs(hit[seekerName] - hit[senderName]))} ms |`;
  appendFileSync(LEDGER, note + '\n');
} catch (err) {
  console.log(`ERROR ${err.message}`);
} finally {
  await letGo(entries);
  console.log(`camera ${(await cam('off')).text}`);
  process.exit(0);
}
