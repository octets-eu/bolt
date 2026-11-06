// Calibration: at which lead before the expected notify a corner read lands
// in the frame, over the bridge. The sender sends one channel at a fixed
// strength every 200 ms; the seeker learns the beat from its notifies and
// fires one read per frame at each lead in turn. Prints landed per lead.
//
//   BRIDGE_HOST=192.168.5.2 npx tsx packages/core/src/brain/utils/read-timing.mjs [seeker] [strength]

import { DeviceId, SensorCommand, Target } from '@bolt/core';
import { NAMES, bringUp, letGo, wait } from './rig.mjs';

const seekerName = process.argv[2] ?? NAMES[0];
const strength = Number(process.argv[3] ?? 16);
const READ = { name: 'infraredReadings', device: DeviceId.sensor, id: SensorCommand.getInfraredReadings, target: Target.st, data: [] };
const BEAT = 200.44, PER = 15;
const LEADS = (process.env.LEADS ?? "20,40,60,80,100,120,140,160,180,200").split(",").map(Number);

const entries = [];
try {
  const seeker = await bringUp(seekerName), sender = await bringUp(NAMES.find((n) => n !== seekerName));
  entries.push(seeker, sender);
  let sending = true;
  const loop = (async () => { while (sending) { const t = Date.now(); await sender.bolt.actuators.infrared.send(3, strength); await wait(Math.max(0, 200 - (Date.now() - t))); } })();
  const notifies = [];
  await seeker.bolt.sensors.infrared.subscribe(({ payload }) => { if (payload[0] === 3) notifies.push(performance.now()); void seeker.bolt.sensors.listenInfrared(true).catch(() => {}); });
  await seeker.bolt.sensors.listenInfrared(true);
  await wait(4000);
  // phase from the notifies so far, circular mean
  const phaseOf = (ts) => { let x = 0, y = 0; for (const t of ts) { const a = 2 * Math.PI * (t % BEAT) / BEAT; x += Math.cos(a); y += Math.sin(a); } return ((Math.atan2(y, x) / (2 * Math.PI) * BEAT) % BEAT + BEAT) % BEAT; };
  console.log(`notifies in 4 s: ${notifies.length}`);
  let spin = 0;
  if (process.env.SPIN) await seeker.bolt.actuators.motor.stabilize(1);
  for (const lead of LEADS) {
    let landed = 0, corners = [0, 0, 0, 0];
    for (let i = 0; i < PER; i++) {
      const phase = phaseOf(notifies.slice(-10));
      const now = performance.now();
      const at = phase + Math.ceil((now + lead + 10 - phase) / BEAT) * BEAT - lead;
      await wait(Math.max(0, at - performance.now() - 4));
      while (performance.now() < at) { /* spin */ }
      const p = await seeker.bolt.queue.fire(READ, 150).then((a) => a.payload, () => null);
      if (process.env.SPIN) void seeker.bolt.actuators.motor.roll(0, (spin += 12) % 360);   // turning in place, a roll right after the read like the brain
      if (p && p.some((c) => c === 3)) { landed++; p.forEach((c, k) => { if (c === 3) corners[k]++; }); }
    }
    console.log(`lead ${lead} ms: ${landed}/${PER} landed, corners FL FR BR BL ${corners.join(' ')}`);
  }
  sending = false; await loop;
} catch (err) {
  console.log(`ERROR ${err.message}`);
} finally {
  await letGo(entries);
  process.exit(0);
}
