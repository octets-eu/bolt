# Bolt agent workspace

You run inside the sandbox container on the rig. This folder is the part of the Bolt project an agent needs, assembled by the project's sync; the browser app, the session history and the git history stay outside. Two Bolts and an infrared beacon are on a floor next to the rig. 

## Know-how

Read these before touching a Bolt, in this order:

- `docs/hide-and-seek.md` is the goal: what happens in a game.
- `docs/bolt-reference.md` is how a Bolt works, independent of floor and room.
- `docs/recipes.md` is the seek as it stands, pointing at the code.
- `docs/terms.png` is the vocabulary.

The library is `packages/core/src`. `behavior/` holds behaviors with a result and a reason, `experiments/` holds functions under test.

## What the rig provides

- **Two Bolts** through the bridge on the host: `SB-9129` on port 7001, `SB-11DF` on 7002, control on 7000, host `$BRIDGE_HOST` (192.168.5.2). The bridge holds the one Bluetooth link each and cuts the motors when your process disconnects, goes silent for 3 s, or on `stop`. `packages/node-socket/src/transport.ts` has the protocol in its header.

- **The M5 beacon** through the forwarder on port 7010 of the same host. One text line per request: `ping`, `send <ch> [count] [gapMs]`, `frame <ch> <duty> [count]`, `beacon <far> <near> <seconds>`. It sends Bolt-format frames on a channel; channel 7 is free of the ladders 0 to 6.

- **The Node path.** `@bolt/node-socket` is the core `Transport` over the bridge socket. `npm run rig` (`packages/node-socket/connect.mjs`) brings the Bolts up, reads the battery and lets go; it is the pattern to follow. `npm run m5test` crosses both bridges.

- **Builds.** `node_modules` is prebuilt. After a sync, build the library before running anything: `npm run build --workspace packages/core && npm run build --workspace packages/node-socket`


## In case of

if you need attention, stop the bolts, and make them sleep, let the M5 beep three times loudly, the user will connect via TMUX and give answers. This includes : bolt stuck or lost, run out of credits, or anything else.

