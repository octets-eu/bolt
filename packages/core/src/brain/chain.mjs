// Chain test, numbers only, no motion: both Bolts up through the bridge, their
// battery voltage and state, the M5 ping, ten M5 frames on channel 7 counted by
// one listening Bolt, one ultrawide camera frame, camera off, let go. Every
// number, and what did not answer, goes to brain/docs/chain.md.
//
//   BRIDGE_HOST=192.168.5.2 npx tsx packages/core/src/brain/chain.mjs

import net from 'node:net';
import { writeFileSync } from 'node:fs';
import { Bolt } from '@bolt/core';
import { SocketTransport, portFor } from '@bolt/node-socket';

const host     = process.env.BRIDGE_HOST ?? '127.0.0.1';
const NAMES    = ['SB-9129', 'SB-11DF'];
const LISTENER = 'SB-9129';
const CHANNEL  = 7;
const COUNT    = 10;
const OUT      = new URL('./docs/chain.md', import.meta.url);
const COLORS   = { console: '#999', plot: 'gray', backcolor: '#ccc', log: '#ccc', front: [10, 0, 0], back: [5, 5, 5], black: [0, 0, 0], matrix: [200, 200, 200] };

const lines = [];
const note  = (s) => { console.log(s); lines.push(s); };
const msg   = (e) => (e instanceof Error ? e.message : String(e));
const wait  = (ms) => new Promise((r) => setTimeout(r, ms));
const within = (p, ms, what) => Promise.race([p, wait(ms).then(() => { throw new Error(`${what}: no answer in ${ms} ms`); })]);

/** One line to a host forwarder; resolves with the text reply and any bytes after it. */
function ask (port, line, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const s = net.connect(port, host, () => s.write(line + '\n'));
    s.setTimeout(timeout);
    s.on('data', (c) => chunks.push(c));
    s.on('timeout', () => { s.destroy(); reject(new Error(`port ${port} '${line}': timeout`)); });
    s.on('error', reject);
    s.on('end', () => {
      const buf = Buffer.concat(chunks);
      const nl = buf.indexOf(10);
      resolve({ text: buf.subarray(0, nl < 0 ? buf.length : nl).toString().trim(), bytes: nl < 0 ? Buffer.alloc(0) : buf.subarray(nl + 1) });
    });
  });
}

/** The M5 forwarder answers one line and may keep the socket; resolve on the first line. */
function m5 (line) {
  return new Promise((resolve, reject) => {
    const s = net.connect({ host, port: 7010 }, () => s.write(line + '\n'));
    let buf = '';
    s.setTimeout(30000);
    s.on('data', (d) => { buf += d; if (buf.includes('\n')) { s.end(); resolve(buf.trim()); } });
    s.on('timeout', () => { s.destroy(); reject(new Error(`m5 '${line}': timeout`)); });
    s.on('error', reject);
  });
}

const live = {};
try {
  note(`# Chain test ${new Date().toISOString()}`);
  note('');
  note(`Bridge host ${host}. No motion; the Bolts were only taken over, read and let go.`);
  note('');
  note('## Bolts');
  for (const name of NAMES) {
    try {
      const transport = new SocketTransport(name, portFor(name), { host });
      const bolt = new Bolt(name, { colors: COLORS }, transport);
      await within(transport.connect(), 15000, `${name} connect`);
      live[name] = { bolt, transport };
      await within(bolt.lifecycle.takeover(), 20000, `${name} takeover`);
      const voltage = await within(bolt.sensors.batteryVoltage(), 5000, `${name} battery voltage`).catch(msg);
      const state   = await within(bolt.sensors.batteryState(), 5000, `${name} battery state`).catch(msg);
      note(`- ${name} (port ${portFor(name)}): battery voltage ${voltage} V, battery state ${state}`);
    } catch (e) {
      note(`- ${name} (port ${portFor(name)}): did not come up: ${msg(e)}`);
    }
  }

  note('');
  note('## M5 beacon (port 7010)');
  try { note(`- ping: \`${await m5('ping')}\``); } catch (e) { note(`- ping: no answer: ${msg(e)}`); }

  const listener = live[LISTENER]?.bolt;
  if (!listener) {
    note(`- frame count: skipped, ${LISTENER} is not up`);
  } else {
    try {
      let heard = 0, total = 0;
      const release = await listener.sensors.infrared.subscribe(({ payload }) => {
        total++;
        if (payload[0] === CHANNEL) heard++;
        void listener.sensors.listenInfrared(true); // one-shot listen, re-arm
      });
      await listener.sensors.listenInfrared(true);
      const reply = await m5(`send ${CHANNEL} ${COUNT} 200`);
      await wait(1500);
      await release();
      note(`- \`send ${CHANNEL} ${COUNT} 200\` reply: \`${reply}\``);
      note(`- ${LISTENER} heard ${heard} of ${COUNT} frames on channel ${CHANNEL}; ${total} infrared notifies on any channel`);
    } catch (e) {
      note(`- frame count: failed: ${msg(e)}`);
    }
  }

  note('');
  note('## Camera (port 7020)');
  try {
    note(`- ping: \`${(await ask(7020, 'ping')).text}\``);
    note(`- on: \`${(await ask(7020, 'on')).text}\``);
    let reply, tries = 0;
    for (; tries < 60; tries++) {
      reply = await ask(7020, 'frame');
      if (reply.text.startsWith('frame')) break;
      await wait(500);
    }
    if (reply.text.startsWith('frame')) {
      const [, size, age] = reply.text.split(' ');
      note(`- ultrawide frame: ${size} bytes announced, ${reply.bytes.length} bytes received, age ${age} ms, after ${tries} retries`);
    } else {
      note(`- ultrawide frame: none, last reply \`${reply.text}\`, status \`${(await ask(7020, 'status')).text}\``);
    }
  } catch (e) {
    note(`- camera: no answer: ${msg(e)}`);
  }
  try { note(`- off: \`${(await ask(7020, 'off')).text}\``); } catch (e) { note(`- off: no answer: ${msg(e)}`); }
} finally {
  for (const { transport } of Object.values(live)) transport.close();
  note('');
  note(`Let go: ${Object.keys(live).join(', ') || 'none'} sockets closed, no drive command sent.`);
  writeFileSync(OUT, lines.join('\n') + '\n');
  await wait(300);
  process.exit(0);
}
