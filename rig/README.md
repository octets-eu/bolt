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
