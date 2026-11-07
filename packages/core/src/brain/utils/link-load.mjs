// Measurement: how often the observation layer's corner reads land, standing,
// with the link quiet and with the brain's other traffic on it (a roll after
// every volley, the matrix twice a second). The sender sends the short ladder (LADDER=long the long one).
// Prints, per condition, frames heard, reads fired, landed, named, flooded.
//
//   BRIDGE_HOST=192.168.5.2 npx tsx packages/core/src/brain/utils/link-load.mjs [seeker] [seconds]

import { NAMES, bringUp, letGo, wait } from './rig.mjs';
import { loadConnectome } from '../connectome/network.mjs';
import { Observation } from '../connectome/observation/observation.mjs';
import { LadderSender } from './ladder.mjs';

const seekerName = process.argv.slice(2).find((a) => NAMES.includes(a)) ?? NAMES[0];
const seconds = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 12);
const entries = [];
try {
  const seeker = await bringUp(seekerName), sender = await bringUp(NAMES.find((n) => n !== seekerName));
  entries.push(seeker, sender);
  // PATTERN=ch:strength,...: these frames in turn, one per beat, instead of the ladder (FIXED=s: 3:s)
  const pattern = (process.env.PATTERN ?? (process.env.FIXED ? `3:${process.env.FIXED}` : '')).split(',').filter(Boolean).map((p) => p.split(':').map(Number));
  let fixed = pattern.length > 0, ladder = null;
  const sending = fixed ? (async () => { let at = performance.now(); for (let k = 0; fixed; k++) { await sender.bolt.actuators.infrared.send(...pattern[k % pattern.length]); at += 200; await wait(Math.max(0, at - performance.now())); } })()
    : process.env.REPEAT ? (ladder = new LadderSender(sender.bolt, process.env.LADDER ?? 'short', Number(process.env.REPEAT))).run()   // REPEAT=n: utils/ladder.mjs
    : sender.bolt.communication.sendLadder(process.env.LADDER ?? 'short').catch(() => {});
  const obs = new Observation(seeker.bolt, loadConnectome().map.ir);
  await obs.start();
  const { motor, matrix } = seeker.bolt.actuators;
  matrix.hold('test');
  let k = 0;
  for (const load of (process.env.LOADS ?? 'quiet,brain,quiet').split(',')) {
    obs.afterVolley = load === 'brain' ? () => {
      if (seeker.bolt.queue.pending > 0) return;
      void motor.roll(0, 0).catch(() => {});   // the same heading: turning would put the sender abeam
      if (k++ % 3 === 0) void matrix.pixel(k % 8, 0, [0, 80, 0], 'test').catch(() => {});
    } : null;
    const s0 = { ...obs.stats };
    await wait(seconds * 1000);
    const d = Object.fromEntries(Object.entries(obs.stats).map(([key, v]) => [key, v - s0[key]]));
    console.log(`${load}: frames ${d.frames} reads ${d.reads} landed ${d.landed} named ${d.named} flooded ${d.flooded}`);
  }
  await obs.stop();
  fixed = false; ladder?.stop(); sender.bolt.abortMotion();
  await Promise.race([sending, wait(1000)]);
} catch (err) {
  console.log(`ERROR ${err.message}`);
} finally {
  await letGo(entries);
  process.exit(0);
}
