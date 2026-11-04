# Rig: running the Bolts without a browser

The browser app drives the Bolts over Web Bluetooth. The rig drives the same
`@bolt/core` from Node, so a seeker can run in a sandbox with no browser and no
Bluetooth of its own.

## Layout on the M1

`/Users/rig/Rig` is this folder, laid down by `agent/sync.sh` from the repo's
`agent/Rig/`: the bridge, the forwarder, the sandbox build, this README.
`container/` inside it is the agent's workspace, the only folder the container
mounts: core, node-socket and the public docs from the repo, plus the brief as
its `CLAUDE.md`. What lives here and nowhere else, the key (`secret.env`), the
agent's home (`claude-home/`) and `sessions/`, no sync touches.

## Topology

```
container (colima)            host (macOS, user rig)              Bolt
  @bolt/core                    bridge.py  ── Bluetooth ──►  SB-9129 / SB-11DF
  @bolt/node-socket  ──TCP──►   (holds the one BLE link)
```

- `bridge.py` is the only process that touches Bluetooth. It connects each Bolt
  by name, does the anti-DoS unlock, shows on the Bolt that it holds it (both
  LEDs in the Bolt's colour, a B on the matrix), reconnects on a drop, and
  serves one TCP port per Bolt (SB-9129 on 7001, SB-11DF on 7002, control on 7000). It cuts the
  motors when a client disconnects, when a client goes silent past its deadman,
  or on `stop`. Only loopback and the colima network may connect.
- `@bolt/node-socket` is the core `Transport` over that socket. `connect.mjs`
  brings the Bolts up and is the pattern a seeker follows.
- `cam.py` is the same split for the phone over the floor: it owns the phone
  through adb, runs scrcpy on its ultrawide camera into ffmpeg, and keeps one
  JPEG current; the container asks on 7020 (`on`, `frame`, `off`). Nothing is
  recorded; the camera runs only between `on` and `off`.
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
Bridge.command on rig's Desktop            # double-click; a link to ~/Rig/Bridge.command
cd ~/Rig && uv run bridge.py               # the same by hand in rig's GUI Terminal
uv run bridge.py status | stop | quit      # from anywhere, incl. SSH
uv run bridge.py battery [SB-9129]         # the volts, through the bridge; not while a session drives
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
~/Rig/sandbox/run.sh                    a shell in the sandbox
~/Rig/sandbox/run.sh npm run rig        bring up the Bolts from inside
~/Rig/sandbox/run.sh npm run m5test     a Bolt hears the M5, across both bridges
```

- **Filesystem.** Only the repo is mounted (`/workspace`); `node_modules` is a
  container-owned volume so the Linux build does not clash with the host's.
  No docker socket is passed in, so nothing inside can widen its own mounts or
  reach another container. The command runs as the host user, so files it
  writes into the repo belong to that user.
- **Network.** `init-firewall.sh` drops all egress but DNS, the host on
  `192.168.5.2:7000-7020` (the Bolt bridge, the M5 forwarder and the camera
  forwarder), and the
  allowlisted domains, by default `api.anthropic.com` alone, so an agent cannot
  install packages. `ALLOW_DOMAINS` in the environment overrides the list for one
  run. It needs `NET_ADMIN`, which `run.sh` grants. Proven: the bridge and
  `api.anthropic.com` are reachable, the registry and other hosts are not.
- **Motors.** The bridge, not the sandbox, is the safety floor: it cuts the
  motors when the client disconnects, goes silent past the deadman, or on `stop`.

First use in a fresh checkout, from a sandbox shell started with
`ALLOW_DOMAINS="api.anthropic.com registry.npmjs.org"`: `npm install`, then build
`@bolt/core` and `@bolt/node-socket`.

## A session: `run-agent.sh`

The image carries the Claude Code CLI. A session is a budget: `~/Rig/run-agent.sh 10`
runs the agent in the firewalled container on the API key, print mode, the
prompt from `~/Rig/prompt.md`, the stream and the result record under
`~/Rig/sessions/<stamp>/`. Before the run it refuses while the last question in
the workspace's `brain/docs/questions.md` has no answer, commits the workspace
and writes the budget into `Session.md`. After the run it rings: a question, a
budget stop or an error page the phone over ntfy and beep the M5 three times, a
clean end beeps once and pages "done". `MODEL`, `EFFORT` and `AUTOCOMPACT` in
the environment pick the model (alias or id), the thinking depth (low to max)
and the context size at which compaction runs; unset, claude's defaults.
`--interactive` runs the same with a terminal; run that inside tmux on the M1
(`agent/watch.sh` opens the session) and attach over SSH from anywhere, Ctrl-b d
detaches. The budget flag is print mode only, so an interactive run is bounded
by the console's limit alone. The script's header has the details.

Files on the M1 that no sync writes: `~/Rig/secret.env` with
`ANTHROPIC_API_KEY=sk-ant-...`, mode 600, and `~/Rig/claude-home`, Claude
Code's HOME in the container, where its config, the workspace trust and the
transcripts (`.claude/projects/-workspace/*.jsonl`) land as plain files owned
by rig. `~/Rig/rig.env` with `NTFY_TOPIC` comes from the sync.

`--strict-mcp-config` keeps the container from starting the repo's `bolt-tools`
MCP server (chrome-devtools-mcp, enabled by `.claude/settings.local.json`): the
sandbox has no Chrome, and the npx install it triggers would fail at the
firewall. Print mode asks no workspace trust; if an interactive run does, the
answer persists in `claude-home`.
