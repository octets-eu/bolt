# Comprehension (2026-11-04, reading only)

## The rig and how to reach it
All of it sits on the host at `$BRIDGE_HOST` (192.168.5.2), which I reach from the container; the scripts fall back to loopback unless I pass that variable.
- **Bolts**: the bridge holds the BLE links. SB-9129 is on port 7001, SB-11DF on 7002. `SocketTransport` frames each message as type, length and payload, and sends a heartbeat every 1 s. If the bridge hears nothing for 3 s, or the socket closes, it cuts the motors, so closing the socket is the stop. The pattern to follow is `connect.mjs`: `transport.connect()`, then `bolt.lifecycle.takeover()`, then work, then `close()`. Port 7000 belongs to the host.
- **Beacon** (M5 Unit IR) on 7010: one text line per request (`ping`, `send`, `frame`, `beacon`). It sends Bolt-format frames, and channel 7 is outside both ladders. It stands at room (154, 295), at the end of the partition.
- **Camera** (a phone) on 7020: `on` (ultrawide, the whole floor) or `on 0` (main camera, the stretch between the speakers), then `frame` returns a 1200x1600 JPEG laid out like the floor plan. `off` stops it.
- **Library**: `packages/core/src`, built with tsx against `dist`. Before any run, build core and then node-socket.

## The challenge and how success is measured
One program holds both Bolts. One Bolt sends the IR ladder. The other runs a brain stored as data in `brain/`, in the format of the worm example: a circuit plus a sensory map. The brain has an observation layer that reads IR frames and receiver corners, a ring attractor that holds direction and confidence (or nothing), and motor neurons that steer toward the sender or search. The program may switch the ladder when the brain asks, but it never tells the brain where the sender is. The library's behaviors are reference reading, not code to run.

A run counts as found when both Bolts report a collision within 300 ms of each other. The time limit is under 30 s per metre of start distance, measured centre to centre, from the seeker's first motion to the shared collision. A run is void if a Bolt leaves the play area. The Bolts must be in line of sight on the same side of the partition. Also judged: code quality, natural-looking behaviour, gentle force, and a ledger of runs and spending in `brain/docs`. Extra points: the ring shown on the seeker's matrix, a moving sender, and low token use.

## What I would verify first, and why
1. **Every part of the rig answers and the batteries read ok.** The challenge's stop rules depend on this, and nothing else matters if it fails.
2. **The tag works at rest and on a gentle contact.** Threshold 20 also fires when a Bolt starts moving. A seeker and a rolling sender starting together could produce a false shared "collision" inside 300 ms, so arming the detector after motion has started needs testing.
3. **Camera pixels to cm.** Map them using the landmarks in the plan header (partition ends, beacon, chest corners). Start distance and leaving the play area can only be measured this way.
4. **Which ladder levels arrive at my chosen start distance**, facing and abeam, and how often a receiver-corner read lands. This is the real input to the observation layer, and the lobe widths of 45 to 75° are not known.
5. **Heading frame after a wake.** Only a wake lines up heading and locator, and the ring has to be anchored to that frame.

## Unclear, missing or contradictory
- **The time budget versus the reference seek.** One sweep takes 15–30 s, and the approach cannot close under about 47 cm. At 1 m that already uses the whole 30 s, so the yardstick is too slow for the target.
- **Near field.** Under about 40 cm no level has a lobe (recipes), yet the last stretch has to end in contact. Nothing says what the ring should be fed there.
- **The ladders overlap.** Strength 2 is on both ladders (channel 1 and channel 5). Ladder switching runs through the referee, which is "read, not run", so the brain has to call `communication.switchLadder` directly.
- **The beacon's argument order is confusing.** `beacon <far> <near>` sends `near` at 1 % and `far` at 33 %. How duty relates to Bolt strength is unmeasured, so the beacon cannot stand in for a sender until it is calibrated.
- **Play area boundary.** It is defined as the ultrawide frame minus furniture and danger zones, with no explicit polygon. The plan gives locator-to-sheet rules only for the two example start spots.
- **Token ledger.** I am asked to keep one, but the only meter is the USD budget display ($3 per session). There is no token count.
- **References that are not here.** `docs/archive` is cited but absent, as the docs warn. Earlier `comprehension-*.md` files exist in this folder; I did not read them so this one stays independent.
- **Wording.** "Ring encodes nose or tail" is left to me. The receiver order (FL, FR, BR, BL) differs from the emitter order (front, left, right, rear), so they are easy to mix up.
