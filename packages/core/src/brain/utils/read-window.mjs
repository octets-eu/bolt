// Measurement: where the corner reads land for frames of different channels.
// The notify of a frame on channel c comes about 25 ms per channel number
// later (frame-timing.mjs, 2026-11-07). The sender sends channels 0 to 3 at
// strength 16 in turn; the seeker learns the beat from notifies less 25 ms
// per channel, and fires one read per beat at an offset from that phase.
// Prints, per offset, the reads that landed, by the channel they show.
//
//   BRIDGE_HOST=192.168.5.2 npx tsx packages/core/src/brain/utils/read-window.mjs [seeker]

import { DeviceId, SensorCommand, Target } from '@bolt/core';
import { NAMES, bringUp, letGo, wait } from './rig.mjs';

const seekerName = process.argv[2] ?? NAMES[0];
const READ = { name: 'infraredReadings', device: DeviceId.sensor, id: SensorCommand.getInfraredReadings, target: Target.st, data: [] };
const BEAT = 200.44, PER = 24, PER_CH = Number(process.env.PER_CH ?? 25);
const OFFSETS = (process.env.OFFSETS ?? '-120,-100,-80,-60,-40,-20,0,20').split(',').map(Number);

const entries = [];
try {
  const seeker = await bringUp(seekerName), sender = await bringUp(NAMES.find((n) => n !== seekerName));
  entries.push(seeker, sender);
  let sending = true;
  const loop = (async () => { let at = performance.now(); for (let k = 0; sending; k++) { await sender.bolt.actuators.infrared.send(k % 4, 16); at += 200; await wait(Math.max(0, at - performance.now())); } })();
  const learn = [];
  await seeker.bolt.sensors.infrared.subscribe(({ payload }) => {
    void seeker.bolt.sensors.listenInfrared(true).catch(() => {});
    const t = performance.now() - PER_CH * payload[0];
    if (payload[0] < 4 && t - (learn.at(-1) ?? -1e9) > 100) { learn.push(t); if (learn.length > 10) learn.shift(); }
  });
  await seeker.bolt.sensors.listenInfrared(true);
  await wait(3000);
  const phaseOf = (ts) => { let x = 0, y = 0; for (const t of ts) { const a = 2 * Math.PI * (t % BEAT) / BEAT; x += Math.cos(a); y += Math.sin(a); } return ((Math.atan2(y, x) / (2 * Math.PI) * BEAT) % BEAT + BEAT) % BEAT; };
  for (const off of OFFSETS) {
    const byCh = [0, 0, 0, 0];
    for (let i = 0; i < PER; i++) {
      const phase = phaseOf(learn);
      const at = phase + Math.ceil((performance.now() + 15 - off - phase) / BEAT) * BEAT + off;
      await wait(Math.max(0, at - performance.now() - 4));
      while (performance.now() < at) { /* spin */ }
      const p = await seeker.bolt.queue.fire(READ, 150).then((a) => a.payload, () => null);
      const ch = p?.find((c) => c < 4);
      if (ch !== undefined) byCh[ch]++;
    }
    console.log(`offset ${off} ms: landed by channel 0..3 ${byCh.join(' ')}`);
  }
  sending = false; await loop;
} catch (err) {
  console.log(`ERROR ${err.message}`);
} finally {
  await letGo(entries);
  process.exit(0);
}
