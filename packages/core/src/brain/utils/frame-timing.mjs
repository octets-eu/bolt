// Measurement: when a frame goes out against the send command that loaded it.
// The sender sends codes in a pattern, a command every 200 ms; the seeker
// listens. Per pattern: the notify's delay after the last command of its
// channel, quantiles in ms, and the frames heard per command.
//
//   BRIDGE_HOST=192.168.5.2 npx tsx packages/core/src/brain/utils/frame-timing.mjs [seeker]

import { NAMES, bringUp, letGo, wait } from './rig.mjs';

const seekerName = process.argv[2] ?? NAMES[0];
const q = (a) => { const s = [...a].sort((x, y) => x - y); return [0.1, 0.5, 0.9].map((p) => Math.round(s[Math.floor(p * (s.length - 1))] ?? NaN)).join(' / '); };
const PERIOD = Number(process.env.PERIOD ?? 200);   // ms between commands
const ONLY = process.env.ONLY?.split(',');
const PATTERNS = {
  fixed:  [[3, 16]],
  alt:    [[2, 16], [3, 16]],
  pairs:  [[2, 16], [2, 16], [3, 16], [3, 16]],
  ladder: [[0, 2], [1, 4], [2, 8], [3, 16]],
  ladder2: [[0, 2], [0, 2], [1, 4], [1, 4], [2, 8], [2, 8], [3, 16], [3, 16]],
  chans: [[0, 16], [1, 16], [2, 16], [3, 16]],
  high:  [[3, 16], [4, 16], [5, 16], [6, 16]],
};

const entries = [];
try {
  const seeker = await bringUp(seekerName), sender = await bringUp(NAMES.find((n) => n !== seekerName));
  entries.push(seeker, sender);
  let notifies = [];
  await seeker.bolt.sensors.infrared.subscribe(({ payload }) => { notifies.push({ t: performance.now(), ch: payload[0] }); void seeker.bolt.sensors.listenInfrared(true).catch(() => {}); });
  await seeker.bolt.sensors.listenInfrared(true);
  for (const [name, pattern] of Object.entries(PATTERNS).filter(([n]) => !ONLY || ONLY.includes(n))) {
    const sent = [];
    notifies = [];
    const t0 = performance.now(), next = { at: t0 };
    for (let k = 0; performance.now() - t0 < 10000; k++) {
      const [ch, s] = pattern[k % pattern.length];
      sent.push({ t: performance.now(), ch });
      await sender.bolt.actuators.infrared.send(ch, s);
      next.at += PERIOD;
      await wait(Math.max(0, next.at - performance.now()));
    }
    await wait(300);
    const delays = notifies.flatMap((n) => { const c = sent.filter((x) => x.ch === n.ch && x.t < n.t).at(-1); return c ? [n.t - c.t] : []; });
    const gaps = notifies.slice(1).map((n, i) => n.t - notifies[i].t).filter((g) => g > 100);
    const per = [...new Set(pattern.map(([c]) => c))].map((c) => `ch${c} ${q(notifies.flatMap((n) => { if (n.ch !== c) return []; const x = sent.filter((y) => y.ch === c && y.t < n.t).at(-1); return x ? [n.t - x.t] : []; }))}`).join('; ');
    console.log(`${name}: per channel delay ${per}`);
    console.log(`${name}: ${notifies.length} notifies for ${sent.length} commands; delay 10/50/90 % ${q(delays)} ms; gap 10/50/90 % ${q(gaps)} ms`);
  }
} catch (err) {
  console.log(`ERROR ${err.message}`);
} finally {
  await letGo(entries);
  process.exit(0);
}
