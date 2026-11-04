# Bolt agent workspace

You run inside the sandbox container on the rig. This folder is the part of the Bolt project an agent needs, assembled by the project's sync; the browser app, the session history and the git history stay outside. Two Bolts and an infrared beacon are on a floor next to the rig. 

## Know-how

The task is `Challenge.md`; read it first, it points at the rest. Before touching a Bolt:

- `docs/bolt-reference.md` is how a Bolt works, independent of floor and room.
- `docs/recipes.md` is the seek as it stands, pointing at the code.
- `docs/terms.png` is the vocabulary.
- `recipes.md` says hider where the challenge says sender.
- `docs/archive`, cited in some code headers, is not here; the headers carry the numbers.

The library is `packages/core/src`. `behavior/` holds behaviors with a result and a reason, `experiments/` holds functions under test.

## What the rig provides

- **Two Bolts** through the bridge on the host: `SB-9129` on port 7001, `SB-11DF` on 7002, control on 7000, host `$BRIDGE_HOST` (192.168.5.2). The bridge holds the one Bluetooth link each and cuts the motors when your process disconnects, goes silent for 3 s, or on `stop`. `packages/node-socket/src/transport.ts` has the protocol in its header.

- **The M5 beacon** through the forwarder on port 7010 of the same host. One text line per request: `ping`, `send <ch> [count] [gapMs]`, `frame <ch> <duty> [count]`, `beacon <far> <near> <seconds>`. It sends Bolt-format frames on a channel; channel 7 is free of the ladders 0 to 6.

- **The camera** over the floor, through the camera forwarder on port 7020 of the same host, one text line per connection: `ping`, `on [id]`, `off`, `status`, `frame`. `on` alone streams the ultrawide, id 2, the whole floor; `on 0` streams the main camera, the stretch between the speakers at twice the detail; `floor-ultra-wide.jpg` and `floor-main.jpg` show each. After `on` the phone streams and `frame` answers `frame <bytes> <age_ms>` followed by the JPEG, 1200x1600, turned to lie like the floor plan, x right and y down, about two a second; `off` stops the camera. `npm run camtest` (`packages/node-socket/camtest.mjs`) fetches one frame into `frames/`. The workspace has `jpeg-js`, `sharp` and `@techstark/opencv-js` for whatever you do with a frame.

- **The Node path.** `@bolt/node-socket` is the core `Transport` over the bridge socket. `npm run rig` (`packages/node-socket/connect.mjs`) brings the Bolts up, reads the battery and lets go; it is the pattern to follow. `npm run m5test` crosses both bridges.

- **Builds.** `node_modules` is prebuilt. After a sync, build the library before running anything: `npm run build --workspace packages/core && npm run build --workspace packages/node-socket`


## In case of

When you need the human, for an answer, a stuck or lost Bolt, credits running out, anything: sleep the Bolts, append your question as the last section of `packages/core/src/brain/docs/questions.md`, a heading and the question, and end the session. The human answers under it, a line starting `Answer:`, and starts the next session; read the file first. Nobody watches during a session and nobody answers inside it.

