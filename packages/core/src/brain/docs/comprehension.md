# Comprehension, session 2026-11-04_1947

The agent's reading of the rig and the challenge, written by the agent as text in its first run, Opus, 9 turns, $0.39, 74 s; saved here by hand because print mode denied its Write, which the start script grants from the next run on.

**The rig and how to reach it.** Everything physical goes through host 192.168.5.2:
- **Bolts:** a bridge holds the Bluetooth link to each one. SB-9129 is on port 7001, SB-11DF on 7002, control on 7000. The bridge cuts the motors if the connection drops, on `stop`, or after 3 s of silence, so a heartbeat is needed. `npm run rig` is the pattern to follow.
- **M5 IR beacon:** port 7010, text commands. It sends frames like a Bolt's; channel 7 is free of the ladders. It sits at plan position 154,295.
- **Camera:** port 7020. `on` streams the ultrawide (the whole floor), `on 0` the main camera (the stretch between the speakers, twice the detail). `frame` returns a 1200x1600 JPEG laid out like the floor plan.
- **Floor plan:** `docs/floor-plan.svg`, in cm.

**What the challenge asks.** Build a small brain under `brain/` with three parts: an observation layer that reads the IR ladder, a ring attractor that holds a direction and a confidence (or nothing), and motor neurons that steer by the ring or fall back to searching. It drives the seeker into the sender until both Bolts report the same collision, which stops both. The file format follows `examples/worm`. Success is readable, efficient code, behaviour that looks natural, and under 30 s per metre of start distance, measured Bolt to Bolt. Extra points for showing the ring live on the matrix, low token spend kept in a ledger, and working with a moving sender. Each run is logged in `brain/docs`, speeds stay gentle, and the session budget is $3.

**What I'd check first:**
1. Both Bolt connections and their batteries, via `npm run rig`.
2. A mapping from camera pixels to plan cm, using the partition ends, the beacon and the chest corners. It's the only independent ruler for start distances.
3. That the seeker actually hears the beacon on channel 7 from several directions. The documented reception angles were measured elsewhere.
4. That switching ladders works: a sender frame arrives within 4 s.
5. That the shared-collision rule stays quiet at rest and when a Bolt starts off. At threshold 20, just starting to roll triggers it.
6. How long one sweep takes. At 15–30 s, it already uses up the whole 30 s allowance for 1 m.

**Unclear, missing or contradictory:**
- **Start spots:** the plan's header says 60 cm from each partition end, and the drawn circles agree (x = 211 and 234). The formula in the same header puts them at 241 and 264, 30 cm away. The beacon's position also moved in recent commits (291 → 154).
- **Who calls the tag:** the challenge says the referee. `referee.ts` says the rule still lives in `seekToCollision`.
- **The sweep:** `terms.png` describes a fixed 180° turn in 15° steps. `recipes.md` describes turning to whichever heading is most informative, for 7–15 rounds.
- **The volley:** the drawing in `terms.png` shows three reads, its word list says four receivers.
- **Close range:** `terms.png` says strength 4 has no blind side under 60 cm. `recipes.md` says no level gives a direction under about 40 cm.
- **Play area:** named in the challenge but never defined.
- **Start distance:** centre to centre or surface to surface, by camera or by the Bolt's own position tracking? Not said.
- **Camera:** no pixel-to-cm calibration is given. The plan's coordinates are offset from the sheet by 30, 22.5 cm, which is easy to mix up.
- **"The sender emits constantly"** clashes with the referee switching between the long and short ladders.
- **Battery:** the voltage that counts as low isn't measured.
- **Missing:** `docs/archive` isn't in the workspace. It's not said whether the brain must be data like the worm example or may be code.
