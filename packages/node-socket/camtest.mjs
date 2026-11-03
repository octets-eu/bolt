// One frame from the camera forwarder on the host: switch the camera on, wait
// for a frame, save it under frames/, print its size and the time it took, and
// switch the camera off again. Proves the chain container -> forwarder ->
// scrcpy -> phone. The forwarder's protocol is in agent/Rig/cam.py.
//
//   BRIDGE_HOST=192.168.5.2 npm run camtest           from inside the container
//   npm run camtest -- --keep                         leave the camera on
//   npm run camtest -- 0                              the main camera instead of the ultrawide

import net from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';

const host = process.env.BRIDGE_HOST ?? '127.0.0.1';
const port = Number(process.env.CAM_PORT ?? 7020);
const keep = process.argv.includes('--keep');
const id = process.argv.slice(2).find((a) => /^\d+$/.test(a));

/** One line to the forwarder; resolves with the text reply and the bytes after it. */
function cam (line) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const s = net.connect(port, host, () => s.write(line + '\n'));
    s.on('data', (c) => chunks.push(c));
    s.on('error', reject);
    s.on('end', () => {
      const buf = Buffer.concat(chunks);
      const nl = buf.indexOf(10);
      resolve({ text: buf.subarray(0, nl < 0 ? buf.length : nl).toString(), bytes: nl < 0 ? Buffer.alloc(0) : buf.subarray(nl + 1) });
    });
  });
}

const t0 = Date.now();
console.log('ping:', (await cam('ping')).text);
console.log('on:', (await cam(id ? `on ${id}` : 'on')).text);
let reply;
for (let i = 0; i < 60; i++) {
  reply = await cam('frame');
  if (reply.text.startsWith('frame')) break;
  await new Promise((r) => setTimeout(r, 500));
}
if (!reply.text.startsWith('frame')) {
  console.log('no frame:', reply.text, '|', (await cam('status')).text);
} else {
  const [, size, age] = reply.text.split(' ');
  mkdirSync('frames', { recursive: true });
  const file = `frames/${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
  writeFileSync(file, reply.bytes);
  console.log(`${file}: ${size} bytes, frame age ${age} ms, ${Date.now() - t0} ms from ping`);
}
if (!keep) console.log('off:', (await cam('off')).text);
