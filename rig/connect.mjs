// Bring up one or more Bolts through the bridge, from Node, no browser.
// Proves the chain bridge -> @bolt/node-socket -> @bolt/core: connect, take
// over, read the battery, flash the Bolt's colour on the matrix, let go. No
// motion. Run from the repo root so the workspace packages resolve:
//
//   node rig/connect.mjs                      both Bolts, bridge on loopback
//   node rig/connect.mjs SB-9129              one Bolt
//   BRIDGE_HOST=192.168.5.2 node rig/connect.mjs   from inside the container

import { Bolt } from '@bolt/core';
import { SocketTransport, portFor } from '@bolt/node-socket';

const COLORS = {
  'SB-9129': { console: '#595', plot: 'green', backcolor: '#77b57b', log: '#5ec19d44', front: [10, 0, 0], back: [5, 5, 5], black: [0, 0, 0], matrix: [30, 240, 30] },
  'SB-11DF': { console: '#79C', plot: 'blue',  backcolor: '#759cc5', log: '#5895d444', front: [10, 0, 0], back: [5, 5, 5], black: [0, 0, 0], matrix: [30, 30, 240] },
};
const DEFAULT = { console: '#79C', plot: 'brown', backcolor: '#bfbf85', log: '#bfbf8544', front: [10, 0, 0], back: [5, 5, 5], black: [0, 0, 0], matrix: [30, 240, 30] };

const host  = process.env.BRIDGE_HOST ?? '127.0.0.1';
const names = process.argv.slice(2);
if (names.length === 0) names.push('SB-9129', 'SB-11DF');

/** Print the Bolt's own log, minus the sensordata firehose. */
function printLog (bolt) {
  bolt.events.on('log', (entry) => {
    if (entry.type === 'event') return;
    const data = entry.data === undefined ? '' : ` ${typeof entry.data === 'object' ? JSON.stringify(entry.data) : entry.data}`;
    console.log(`${bolt.name} [${entry.type}] ${entry.subtype}${data}`);
  });
}

async function bringUp (name) {
  const transport = new SocketTransport(name, portFor(name), { host });
  const bolt = new Bolt(name, { colors: COLORS[name] ?? DEFAULT }, transport);
  printLog(bolt);
  bolt.events.on('disconnected', () => console.log(`${name} disconnected`));

  await transport.connect();
  console.log(`${name} socket up, link ${transport.connected}`);
  await bolt.lifecycle.takeover();

  const { status } = bolt;
  console.log(`${name} battery ${status.battery} ${status.voltage ?? '?'} V, charger ${status.charger}, ready ${status.ready}`);

  // a visible sign on the ball: its colour for a moment, then clear
  await bolt.communication.char('*', bolt.config.colors.matrix);
  await new Promise((r) => setTimeout(r, 1500));
  await bolt.actuators.matrix.clear();

  return { bolt, transport };
}

const live = [];
let failed = false;
try {
  for (const name of names) {
    try {
      live.push(await bringUp(name));
    } catch (error) {
      failed = true;
      console.error(`${name} failed: ${error instanceof Error ? error.message : error}`);
    }
  }
  console.log(`up: ${live.map(({ bolt }) => bolt.name).join(', ') || 'none'}`);
} finally {
  for (const { transport } of live) transport.close();
  // the socket close lets the bridge cut the motors; give the writes a moment
  await new Promise((r) => setTimeout(r, 300));
  process.exit(failed ? 1 : 0);
}
