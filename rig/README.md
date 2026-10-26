# Rig: running the Bolts without a browser

The browser app drives the Bolts over Web Bluetooth. The rig drives the same
`@bolt/core` from Node, so a seeker can run in a sandbox with no browser and no
Bluetooth of its own.

## Topology

```
container (colima)            host (macOS, user rig)              Bolt
  @bolt/core                    bridge.py  ── Bluetooth ──►  SB-9129 / SB-11DF
  @bolt/node-socket  ──TCP──►   (holds the one BLE link)
```

- `bridge.py` is the only process that touches Bluetooth. It connects each Bolt
  by name, does the anti-DoS unlock, reconnects on a drop, and serves one TCP
  port per Bolt (SB-9129 on 7001, SB-11DF on 7002, control on 7000). It cuts the
  motors when a client disconnects, when a client goes silent past its deadman,
  or on `stop`. Only loopback and the colima network may connect.
- `@bolt/node-socket` is the core `Transport` over that socket. `connect.mjs`
  brings the Bolts up and is the pattern a seeker follows.
- `m5.py` is the same split for the M5 beacon: it owns the M5's USB serial port
  and runs the `mpremote` sends; the container asks over TCP (7010). The M5
  sends a Bolt-format frame on a channel, channel 7 being free of the ladders.
  `m5test.mjs` crosses both bridges: a Bolt listens while the container tells
  the M5 to send, and counts what was heard.

## The one manual step

macOS grants Bluetooth by how a process was started. Started over SSH the bridge
is denied, so **start it once from the rig user's own Terminal on screen** and
approve the prompt. After that it survives and can be managed over SSH.

```
cd ~/Rig/bridge && uv run bridge.py        # in rig's GUI Terminal, approve Bluetooth
uv run bridge.py status | stop | quit      # from anywhere, incl. SSH
uv run bridge.py probe SB-9129             # one ping through the whole chain
```

## Run a client

From the repo root, after `npm install` and building `@bolt/core` and
`@bolt/node-socket`:

```
npm run rig                                # both Bolts, bridge on loopback
npm run rig -- SB-9129                      # one Bolt
BRIDGE_HOST=192.168.5.2 npm run rig         # from inside the container
```

`npm run rig` runs `connect.mjs` through `tsx`, which resolves the packages'
extensionless ESM imports that a bundler would otherwise handle.

## The sandbox

`sandbox/` runs a client, or an agent, in a container that can reach the Bolts
only through the bridge and reach the network only where the work needs. It is
built and run on the host (colima), where a container reaches the host as
`192.168.5.2`.

```
rig/sandbox/run.sh                      a shell in the sandbox
rig/sandbox/run.sh npm run rig          bring up the Bolts from inside
rig/sandbox/run.sh npm run m5test       a Bolt hears the M5, across both bridges
```

- **Filesystem.** Only the repo is mounted (`/workspace`); `node_modules` is a
  container-owned volume so the Linux build does not clash with the host's.
  No docker socket is passed in, so nothing inside can widen its own mounts or
  reach another container. The command runs as the host user, so files it
  writes into the repo belong to that user.
- **Network.** `init-firewall.sh` drops all egress but DNS, the host on
  `192.168.5.2:7000-7010` (the Bolt bridge and the M5 forwarder), and the
  allowlisted domains (`api.anthropic.com`,
  and `registry.npmjs.org` so the container can install and build; drop the
  latter for full lockdown). It needs `NET_ADMIN`, which `run.sh` grants.
  Proven: the bridge and `api.anthropic.com` are reachable, other hosts are not.
- **Motors.** The bridge, not the sandbox, is the safety floor: it cuts the
  motors when the client disconnects, goes silent past the deadman, or on `stop`.

First use in a fresh checkout, from a sandbox shell: `npm install`, then build
`@bolt/core` and `@bolt/node-socket`.
