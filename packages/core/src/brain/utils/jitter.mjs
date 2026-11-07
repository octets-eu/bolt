// Measurement: the link's timing as the corner reads see it. The sender sends
// one channel every beat; the seeker listens. Prints the spread of the notify
// arrivals about the beat (what the volleys' phase rests on) and the round
// trip of untimed reads, quantiles in ms.
//
//   BRIDGE_HOST=192.168.5.2 npx tsx packages/core/src/brain/utils/jitter.mjs [seeker] [strength]

import { DeviceId, SensorCommand, Target } from '@bolt/core';
import { NAMES, bringUp, letGo, wait } from './rig.mjs';

const seekerName = process.argv[2] ?? NAMES[0];
const strength = Number(process.argv[3] ?? 16);
const READ = { name: 'infraredReadings', device: DeviceId.sensor, id: SensorCommand.getInfraredReadings, target: Target.st, data: [] };
const BEAT = 200.44;
const q = (a) => { const s = [...a].sort((x, y) => x - y); return [0.1, 0.5, 0.9].map((p) => Math.round(s[Math.floor(p * (s.length - 1))])).join(' / '); };

const entries = [];
try {
  const seeker = await bringUp(seekerName), sender = await bringUp(NAMES.find((n) => n !== seekerName));
  entries.push(seeker, sender);
  let sending = true;
  const ladder = process.env.LADDER;   // LADDER=long|short: the ladder instead of the one channel
  const loop = ladder ? sender.bolt.communication.sendLadder(ladder) : (async () => { while (sending) { const t = Date.now(); await sender.bolt.actuators.infrared.send(3, strength); await wait(Math.max(0, 200 - (Date.now() - t))); } })();
  const notifies = [];
  await seeker.bolt.sensors.infrared.subscribe(({ payload }) => { if (ladder ? payload[0] < 7 : payload[0] === 3) notifies.push(performance.now()); void seeker.bolt.sensors.listenInfrared(true).catch(() => {}); });
  await seeker.bolt.sensors.listenInfrared(true);
  const rtt = [];
  let landed = 0;
  const until = performance.now() + 10000;
  while (performance.now() < until) {
    const t = performance.now();
    const p = await seeker.bolt.queue.fire(READ, 300).then((a) => a.payload, () => null);
    if (p) rtt.push(performance.now() - t);
    if (p?.some((c) => (ladder ? c < 7 : c === 3))) landed++;
    await wait(37);
  }
  sending = false; sender.bolt.abortMotion(); await Promise.race([loop, wait(1000)]);
  // residuals about the circular mean phase, a second notify of a frame (under 100 ms after the last) left out
  const ts = notifies.filter((t, i) => i === 0 || t - notifies[i - 1] > 100);
  let x = 0, y = 0;
  for (const t of ts) { const a = 2 * Math.PI * (t % BEAT) / BEAT; x += Math.cos(a); y += Math.sin(a); }
  const phase = Math.atan2(y, x) / (2 * Math.PI) * BEAT;
  const res = ts.map((t) => ((t - phase) % BEAT + 1.5 * BEAT) % BEAT - BEAT / 2);
  console.log(`notifies ${notifies.length} (${ts.length} frames) in 10 s; residual 10/50/90 % ${q(res)} ms; |res| 90 % ${q(res.map(Math.abs)).split(' / ')[2]} ms`);
  console.log(`untimed reads ${rtt.length}, landed ${landed}; round trip 10/50/90 % ${q(rtt)} ms`);
} catch (err) {
  console.log(`ERROR ${err.message}`);
} finally {
  await letGo(entries);
  process.exit(0);
}
