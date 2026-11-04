# Comprehension: reading test, 2026-11-04

I read CLAUDE.md, Challenge.md, Session.md, docs/bolt-reference.md, docs/recipes.md, docs/terms.png, the floor-plan.svg header, the transport header and the headers of the ladder, referee, sweep and seek-to-collision code. I did not touch a Bolt or build anything.

## The rig and how to reach each part
- **Two Bolts** (SB-9129 on port 7001, SB-11DF on 7002, control on 7000) are reached through a Bluetooth bridge on `$BRIDGE_HOST` 192.168.5.2. `@bolt/node-socket`'s `SocketTransport` frames each message as type, length, payload and sends heartbeats. The bridge cuts the motors if my process disconnects, stays silent for 3 s, or sends `stop`. `npm run rig` is the pattern to follow: connect, read the battery, let go.
- **M5 IR beacon** on port 7010. It takes one text line per request and sends Bolt-format frames, normally on channel 7, which no ladder uses. It is an instrument, not part of the seek.
- **Camera** on port 7020, one line per connection. `on` gives the ultrawide (the whole floor) and `on 0` gives the main camera (the stretch between the speakers). `frame` returns a 1200x1600 JPEG oriented like the floor plan. I use it to find, place and measure the Bolts.
- **Code:** the library is in `packages/core/src` and I may write only under `brain/`. After a sync I build core, then node-socket.

## What the challenge asks, and how it is measured
Build a small connectome in `brain/connectome` with three parts. The observation neurons read the IR ladder frames. A ring attractor holds the sender's direction and its confidence, or nothing when there is no data. The motor neurons turn the ring into roll commands and fall back to a search routine when there is no direction, or more than one. The seeker must reach the sender until both Bolts report a collision at the same moment (in the code: within 300 ms), and then both stop. I choose the roles and the start spots, and the Bolts must drive gently.

How it is measured:
- time to collision under 30 s per metre of start distance, measured Bolt to Bolt
- behaviour that looks natural
- code that is efficient and readable

Extra credit: the seeker's matrix shows the ring live, low token use with a budget ledger ($3 this session), and the seek still works when the sender moves. For each run, the ledger in `brain/docs` records the start distance and how it was measured, the time, and the result. Each session also leaves a handover report there.

## What I would verify first, and why
1. **Bridge up, both Bolts awake, battery ok** (`npm run rig`). Nothing else matters without this, and a low battery ends the session.
2. **Camera to sheet mapping** (`on`, `frame`), checked against the landmarks in the floor-plan header: the partition ends, the beacon at 154,295 and the chest corners. I need this to measure start distance, keep the Bolts out of the danger zones and recover a lost Bolt.
3. **IR reception on each Bolt** using the beacon on channel 7: does listen give notifies, and do the corner reads land? This tells a dead receiver apart from a brain bug.
4. **The ladder Bolt to Bolt, on this floor:** which levels arrive at about 1 m and 2 m, and how wide each lobe is. The strengths are "chosen, not derived", and the observation layer rests on them.
5. **Collision detection:** silent at rest on both Bolts, and both fire within 300 ms on a gentle contact. That event is the finish line.
6. **Frames and signs:** after a wake, heading is clockwise while yaw is counter-clockwise, and the floor-plan's formula from locator to sheet position. Getting a sign wrong sends the seeker the wrong way.
7. **One reference sweep (`behavior/sweep.ts`)** to see how long it takes on this floor. At 15 to 30 s per sweep, a single sweep can use up the whole 30 s/m budget at 1 m.

## Unclear, missing or contradictory
- **Sweep:** terms.png defines it as "a standing turn through 180° in 15° steps". recipes.md and sweep.ts describe a belief that picks the most informative heading.
- **Volley:** terms.png says the four receivers are read 6 ms apart. Panel 6 shows three reads, and recipes says "volleys".
- **Round length:** a round is 0.85 s in terms.png. The long ladder is 4 × 200 ms, so about 0.8 s plus the notify scatter. The short ladder is 3 levels, so a shorter round.
- **The bump:** recipes says it is "not built". But seek-to-collision.ts already has seekers (`seek`, `seekEdge`) that "drive into it", plus a pass rule. It is unclear which of these is current.
- **Example start spots:** they are 23 cm apart and back to back. That is under the roughly 40 cm where recipes says no level has a lobe, so they are useless as a seek start except as a contact test.
- **Distance:** "the measure is Bolt to Bolt", but it does not say whether centre to centre or surface to surface (7.3 cm apart).
- **Battery:** "battery state low" ends the session, but the voltage at which a Bolt gives up is unmeasured.
- **Undocumented:** the meaning of the beacon's `beacon <far> <near> <seconds>` and `frame <duty>`. Also how the sender is supposed to move for the "sender moves" extra.
- **Folders:** the folder rule allows only `brain/*`. The sender's ladder and the referee live outside it, so I may use them but not change them.
- **Missing:** `docs/archive` is cited but absent. The package.json workspaces list `apps/*`, which is not here, so the root `npm run build` would fail. Use the per-package builds.
- **Wording:** "Ring attractor encodes ... or none" does not say how confidence should decay without input. Neither does it say what "multiple directions" means for the ring (two bumps, or the nose/tail ambiguity).
