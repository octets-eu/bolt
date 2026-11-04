# Comprehension, 2026-11-04

A reading only: no Bolt, beacon or camera was touched, nothing was built. I left `comprehension-1954.md` unread so this one would be my own reading.

## The rig and how to reach it

All of it sits on host `$BRIDGE_HOST` (192.168.5.2) and is reached over TCP from this container.
- **Two Sphero Bolts**: SB-9129 on port 7001, SB-11DF on 7002, control on 7000. The bridge holds the BLE link and cuts the motors on disconnect, on 3 s of silence, or on `stop`. `SocketTransport` (node-socket) sends the heartbeat. `connect.mjs` is the pattern to follow.
- **M5 IR beacon** on port 7010, one text line per request (`ping`, `send`, `frame`, `beacon`). It sits at a known spot (154, 295 in the room frame) and sends Bolt-format frames. Channel 7 is clear of the ladders.
- **Phone camera** 2 m up, on port 7020: `on [0|2]`, `frame`, `off`. It returns a 1200x1600 JPEG laid out like `docs/floor-plan.svg` (cm, x right, y down). Pixels map to cm through the landmarks in the SVG header: the partition ends, the beacon and the chest corners.
- The camera and the beacon are instruments only. The seek itself runs Bolt to Bolt.

## The challenge and how success is measured

One program holds both Bolts. One sends the IR ladder. The other runs a connectome under `brain/` that steers it into the sender: observation neurons turn the frames into input for a ring attractor (direction and confidence), and motor neurons read the ring, or search when the ring has no single direction. The circuit and sensory map are data in the worm's format, and only code of mine runs them. The library is my hands, and its sweep/approach is for reading, not running. A tag means both Bolts report a collision within about 300 ms, and the tag stops both. Success means readable code, behaviour that looks natural, and time to the shared collision under 30 s per metre of start distance, centre to centre. Per run, the ledger records the distance, how I measured it, the time and the result. Extras: the ring shown on the matrix, a token ledger, and a sender that moves.

## What I would verify first, and why

1. **Rig liveness and battery.** Ping the bridge, beacon and camera, and read each Bolt's firmware battery state. If any part fails, the rules say end the session.
2. **Camera to cm.** Fit pixels to the landmarks and find both Bolts in a frame. Every distance in the ledger and every reset depends on this.
3. **Heading on the sheet.** After sleep/wake, drive a short slow leg and watch it on camera. The Bolt's own heading frame is arbitrary, so I need its offset to the sheet.
4. **Hearing at the planned distance.** Run the ladder from the sender, or the beacon's ladder on channel 7. Check which levels arrive and whether the corner readings name a side. The lobes are "chosen, not derived" and depend on the room. The observation layer has nothing to stand on without this.
5. **The tag.** At threshold 20, check that a gentle bump fires on both Bolts within 300 ms, and that starting off does not. The reference says threshold 20 also fires on starting off. If both Bolts start together, for example a moving sender, that could produce a false tag.

## Unclear, missing or contradictory

- `terms.png` (cited by recipes) and `docs/archive` are missing. `Session.md` holds only the budget.
- The `communication.ts` comment says "channel k carries strength k", but long channel 0 carries strength 2. The channel indexes the level, not the strength.
- The reference calls the IR reading "four strengths" and in the same section says it "shows the channel heard". What the four values actually are is unclear.
- How beacon duty % maps to Bolt strength 0–255 is not given. In `beacon`, "near" is the weak 1 % frame. That fits (weak means heard only near), but nothing says what distance either level reaches.
- The rules do not say whether the brain may ask the program to switch the sender's ladder, as the referee does. That is a channel outside IR, and the challenge says the sender emits "constantly".
- It is not defined when timing starts (program start, first ladder frame, first motion), or whether a run that leaves the play area counts.
- "Play area" means the ultrawide view minus danger zones and furniture. The plan's danger zones are "no collision expected", yet they are excluded from play.
- The locator-to-sheet rule in the SVG holds only for the two example starts. Other starts need the camera.
- Matrix output for the ring shares the roughly 30 commands/s link with the timed IR reads.
- Budget: $3 for reading, calibration, building and runs is tight. The library's sweep alone takes 15–30 s, about the whole time allowed for 1 m.
- Folders: only `brain/*` may be written, but the runnable program, node-socket and the build output sit outside it. The entry point probably has to live in `brain/` and import `@bolt/node-socket`.
