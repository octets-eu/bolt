/**
 * The bridge's per-Bolt ports, matching BOLTS in Rig/bridge/bridge.py. The
 * bridge connects each Bolt by its advertised name and serves it on its port.
 */
export const BRIDGE_PORTS: { readonly [name: string]: number } = {
  'SB-9129': 7001,
  'SB-11DF': 7002,
};

export function portFor (name: string): number {
  const port = BRIDGE_PORTS[name];
  if (port === undefined) throw new Error(`node-socket: no bridge port for ${name}`);
  return port;
}
