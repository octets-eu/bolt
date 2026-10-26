// End-to-end over both host bridges: a Bolt listens through the Bolt bridge
// while the container tells the M5 forwarder to send frames on channel 7 (free
// of the ladders). Counts the channel-7 notifications heard. Proves the chain
// container -> M5 forwarder -> infrared -> Bolt -> bridge -> container.
//
//   BRIDGE_HOST=192.168.5.2 node rig/m5test.mjs [SB-9129] [channel] [count]

import net from 'node:net';
import { Bolt } from '@bolt/core';
import { SocketTransport, portFor } from '@bolt/node-socket';

const host    = process.env.BRIDGE_HOST ?? '127.0.0.1';
const m5Port  = Number(process.env.M5_PORT ?? 7010);
const name    = process.argv[2] ?? 'SB-9129';
const channel = Number(process.argv[3] ?? 7);
const count   = Number(process.argv[4] ?? 10);

/** One line to the M5 forwarder; resolves with its reply. */
function m5 (line) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port: m5Port }, () => socket.write(line + '\n'));
    let buffer = '';
    socket.setTimeout(30000);
    socket.on('data', (d) => { buffer += d; if (buffer.includes('\n')) { socket.end(); resolve(buffer.trim()); } });
    socket.on('timeout', () => { socket.destroy(); reject(new Error('m5 timeout')); });
    socket.on('error', reject);
  });
}

const transport = new SocketTransport(name, portFor(name), { host });
const bolt = new Bolt(name, { colors: { console: '#999', plot: 'gray', backcolor: '#ccc', log: '#ccc', front: [10, 0, 0], back: [5, 5, 5], black: [0, 0, 0], matrix: [200, 200, 200] } }, transport);

let heard = 0;
let total = 0;

try {
  await transport.connect();
  await bolt.lifecycle.takeover();
  console.log(`${name} up, listening for channel ${channel}`);

  // the listen is one-shot: re-arm after every notify, as the behaviors do
  const release = await bolt.sensors.infrared.subscribe(({ payload }) => {
    total++;
    if (payload[0] === channel) heard++;
    void bolt.sensors.listenInfrared(true);
  });
  await bolt.sensors.listenInfrared(true);

  console.log(`M5: ${await m5(`send ${channel} ${count} 200`)}`);
  await new Promise((r) => setTimeout(r, 1500)); // let the last notifies arrive

  await release();
  console.log(`heard channel ${channel}: ${heard} of ${count} sent; ${total} notifies on any channel`);
} finally {
  transport.close();
  await new Promise((r) => setTimeout(r, 300));
  process.exit(0);
}
