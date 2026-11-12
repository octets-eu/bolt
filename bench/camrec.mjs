// The phone's frames saved beside a run: every frame the camera forwarder
// (agent/Rig/cam.py, `npm run cam`) holds, asked for over its TCP port every
// PERIOD_MS, written as <dir>/<ms since 1970 at receipt>-<age ms>.jpg, the age
// the forwarder's. Outside the page, so a run carries no load from it. Ends
// after the seconds given or when killed. The stream must be on.
//
//   node bench/camrec.mjs <dir> [seconds]

import { connect } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';

const [dir, seconds = '600'] = process.argv.slice(2);
if (!dir) { console.error('usage: node bench/camrec.mjs <dir> [seconds]'); process.exit(1); }
const PERIOD_MS = 250, PORT = Number(process.env.CAM_PORT ?? 7020);
mkdirSync(dir, { recursive: true });

const frame = () => new Promise((resolve, reject) => {
  const chunks = [];
  const s = connect(PORT, '127.0.0.1', () => s.write('frame\n'));
  s.setTimeout(3000, () => { s.destroy(); reject(new Error('no reply')); });
  s.on('data', (c) => chunks.push(c));
  s.on('error', reject);
  s.on('end', () => {
    const buf = Buffer.concat(chunks), nl = buf.indexOf(10), head = buf.subarray(0, nl).toString().split(' ');
    if (head[0] !== 'frame') reject(new Error(buf.subarray(0, 80).toString())); else resolve({ age: Number(head[2]), jpeg: buf.subarray(nl + 1) });
  });
});

const until = Date.now() + Number(seconds) * 1000;
let saved = 0, last = -1;
while (Date.now() < until) {
  const t = Date.now();
  try {
    const f = await frame(), taken = Date.now() - f.age;
    if (Math.abs(taken - last) > 50) { writeFileSync(`${dir}/${Date.now()}-${f.age}.jpg`, f.jpeg); saved++; last = taken; }   // a frame once
  } catch (e) { console.error(String(e)); }
  await new Promise((r) => setTimeout(r, Math.max(0, PERIOD_MS - (Date.now() - t))));
}
console.log(`${saved} frames in ${dir}`);
