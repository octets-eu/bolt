# Comprehension, 2026-11-04

## The rig and how to reach it
Two Sphero Bolts, SB-9129 (green) and SB-11DF (blue). Each is a 7 cm ball with gyro, a dead-reckoning locator, a collision detector, an 8x8 matrix and four IR emitter/receiver pairs. They sit on a living-room floor drawn in `docs/floor-plan.svg` (1 unit = 1 cm). A bridge on the host (`$BRIDGE_HOST`, 192.168.5.2) holds the Bluetooth links: TCP 7001 and 7002, one per Bolt, with the framing in `node-socket/src/transport.ts`, plus a control port on 7000. The bridge cuts the motors after 3 s of silence. `connect.mjs` is the pattern: `SocketTransport` → `Bolt` → `lifecycle.takeover()`. The M5 IR beacon is on 7010 and takes text lines (`send`, `frame`, `beacon`, channel 7 free). The overhead phone camera is on 7020 (`on [0|2]`, `frame` → JPEG 1200x1600, laid out like the plan). Camera and beacon are only for placing and checking the Bolts, never for the seek itself.

## What the challenge asks, and how success is measured
One program holds both Bolts. Either Bolt can take either role. The sender loops an IR ladder: strengths 2/4/8/16 on channels 0–3, or the short one, 1/2/4 on channels 4–6. The seeker runs a connectome of my own, stored as data in the worm's format (circuit + sensory map). It has an observation layer for the IR frames, a ring attractor holding direction and confidence, and motor neurons that steer or fall back to a search. It drives into the sender and calls the tag: both Bolts report a collision within ~300 ms. The code goes in `brain/` only and uses the library's lower layers; the traditional sweep/approach is reference, not something to run. Success: under 30 s per metre of start distance (centre to centre), timed from the seeker's first motion to the shared collision. A run where a Bolt leaves the play area is void. The behaviour should look natural, and the code should be readable. Extras: the ring shown on the matrix live, the sender moving, low token spend. A ledger of runs and a report go in `brain/docs`.

## What I would verify first, and why
1. **The rig answers.** Build, then ping the bridge for both Bolts, the beacon and the camera, and read each battery state (the firmware's word, not the voltage). The rules say to stop on low battery or any silence.
2. **Camera to sheet.** Fit pixels to plan cm from the landmarks (partition ends, beacon, chest corners), mark the play area minus danger zones and furniture, and identify each Bolt by its matrix colour. Every distance in the ledger, every start spot and every "left the area" call depends on this.
3. **The tag.** Threshold 20 is documented as firing on starting off as well as on contact. I need to know whether both Bolts stay quiet at rest and at the start of a roll. A moving sender with a seeker accelerating at the same moment could fake a "found".
4. **IR on this floor.** At 0.5, 1 and 2 m, which ladder levels arrive, and how wide their lobes are, nose and tail, and how often a timed corner read lands. The observation layer and the ring's gain stand on these numbers, and the recipes call them chosen, not measured.
5. **Motion.** Turn accuracy, speed and stopping distance at a gentle speed. The reference leaves floor-dependent figures out on purpose, and the force limit applies.

## Unclear, missing, contradictory
- `connect.mjs` defaults the host to 127.0.0.1, while CLAUDE.md says 192.168.5.2. `BRIDGE_HOST` has to be set. What the control port 7000 does is described nowhere, and no client script uses it.
- Where the referee, `negotiate-ladder` and `beat.ts` (timed reads) fall is not drawn. Are they "lower layers" I may use, or part of the seek that is "to read, not to run"? The task says the brain sends the ladder itself.
- "Within a moment" (Challenge) vs 300 ms (code). The 23 cm start pair is called too close, but no minimum distance is given. The partition splits the room, and line of sight across it is not discussed.
- Timing: a sweep alone takes 15–30 s, and the approach cannot close under ~47 cm. Against 30 s/m that leaves almost no slack, so the traditional pace is not a usable baseline.
- How beacon duty maps to Bolt strength, and the IR reach on this floor, are both unmeasured. Floor speeds are unmeasured too.
- The second danger zone ("from the left wall and the left part's skirting board, 160x80") does not say which side of the partition it is on. The plan's locator-to-sheet rule covers only the two example starts.
- `docs/archive` is cited but absent. There is no previous report or ledger yet, only two earlier comprehension files.
- A $3 session budget looks far too small to build the connectome, calibrate and run timed trials. Several sessions will be needed.
