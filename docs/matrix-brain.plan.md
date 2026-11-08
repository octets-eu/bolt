# Matrix brain mode

A mode of the browser app: one Bolt sends the ladder, the other runs the brain with the motors off and shows on its matrix where the ring believes the sender is. The user moves the Bolts by hand and watches the ring. Two steps: first the ring, the infrared and the matrix working with a good picture and the right direction; then new data, camera or the user's eye, as it comes.

## Decisions

- One ladder, one sender, one seeker; both Bolts sending waits until the interference is tested.
- All code in `apps/browser/src/matrix-brain/`.
- A usable frame is anything that updates the ring's belief: a landed corner read or a carrier notify, as the observation layer feeds them.
- The whole ring is drawn on the 28 border LEDs by a render function that projects the 16 ring neurons onto the border; an axis bump shows as two lit arcs, a tipped ring as one. Confidence by colour in the camera's three states: off, green (low), red (high).
- Motors off: no roll, and the motor layer is not logged for now.
- Camera and volley retuning are postponed to step 2.

## Reference system

The floor plan's frame, which the phone's frames lie in (the forwarder turns them so): North is up, East right, bearings clockwise from North. A Bolt's ring angle is clockwise from its nose; the nose is the matrix's row 7, by the red LED, and the border LED in the ring's direction is lit. The two Bolts' reference places are in the partition's opening, SB-11DF west of SB-9129.

## The phone as the eye

The main camera (id 0) at 3264 px and 12 Mbit/s, through the Camera tab's Phone section, zoomed on the canvas. From the mount it gives about 1 px per mm of floor: a Bolt is 70 px, an LED 3 to 4 px, so the camera reads a lit row or an arc of several LEDs, not a single column. The camera's own zoom (`CAM_ZOOM=2`, scrcpy's `--camera-zoom`) doubles that and shows the LED grid, at the price of half the floor in view, about 1.25 by 0.95 m around the centre. Focus is the phone's continuous autofocus, which scrcpy cannot set; it hunts when a bright blob appears on the dark floor. The matrix against the floor's exposure, the whole matrix in one colour, the canvas measured against the dark matrix (pixels brighter by 50, zoom 14, 2026-11-08):

| Colour | fills the matrix at | white from | the camera's hue |
|---|---|---|---|
| green | 40 | 80 | cyan |
| blue | 80 | 255 | cyan, less red bleed |
| red | 20 | 80 | pink |
| white | under 20 | 20 | white |

So for the camera green 40, blue 80 and red about 12 are alike, and its two hues are cyan and pink; the eye ranks the colours the other way round, green lightest. The ring's colours are the camera's three states: off for no belief, green 40 for low confidence, red 12 for full, interpolated between; the seeker's nose LED is a dim yellow with the tail off; the Bolt's own colours return when the mode ends.

## What exists

| Piece | Where | Note |
|---|---|---|
| The brain: observation, ring, network | `packages/core/src/brain/connectome/` | Node over the bridge; `network.mjs` reads the two data files with `readFileSync` |
| Ladder sender on a held schedule | `packages/core/src/brain/utils/ladder.mjs` | imports `@bolt/core` only, runs in the browser as is |
| Ring on the matrix | `packages/core/src/brain/utils/matrix-view.mjs` | one border pixel; takes row 0 as the nose, `images.ts` says row 0 is the back: the 180° |
| Matrix ownership | `actuators/matrix.ts` | one owner; the ladder's pictures from `switchLadder` are dropped while the brain holds the seeker's matrix |
| Header | `apps/browser/src/components/header/header.ts` | the toggle goes beside the buttons |
| Session log | `apps/browser/src/session.ts`, `Logger` | every logged line reaches the session file |

## Step 1

1. **Rotation check.** Light one pixel on the row opposite row 0 of a standing Bolt and look; that row is the nose for the render.
2. **Brain in the browser.** `loadConnectome` and its `node:fs` import move to a Node-only file beside `network.mjs`; `Network` already takes the two objects. The app imports `circuit.json` and `sensory_map.jsonc?raw` through Vite. The only touch on the agent's files.
3. **Runner, `matrix-brain/runner.ts`.** Builds `Observation` and `Network` for the seeker, steps the network on each motion sample with the yaw, as `brain.mjs` does, without the motor; `self.forward` is 0, `self.still` comes from the yaw. Starts a `LadderSender` on the sender.
4. **Render, `matrix-brain/render.ts`.** Ring rates, 16 values by angle off the nose, projected onto the 28 border LEDs by angle: each LED takes the rate at its own angle, interpolated. Colour by the population vector's length, blue at 0 to green at full; brightness the rate times 80 %, 100 % for 200 ms after a usable frame. Updates in the beat's idle part, pixels that changed only.
5. **Toggle.** Header button `brain`, green on, grey off, enabled with two Bolts connected. Sender and seeker by name for now. Off, STOP and disconnect stop everything, listen off, matrix cleared and released.
6. **Log.** Seeker: every notify (t, channel), every landed read (t, corners), once a second ring angle, length, peaks, carrier, near. Sender: ladder switches. Prefixed for a script over the session zip.

## Replay

`packages/core/src/experiments/replay.mjs` runs an estimator over a recorded run and scores it against the truth: the sweep and approach tests of 2026-10 (18 runs, about 3 000 s, 7 000 frames, 540 landed reads) log every frame, every corner read and the motion stream, and the sender's place in the seeker's locator frame. Score: lock = the first second from which the error stays under 30° for 3 s, then the share of seconds under 30°, the mean error. `--senses` tabulates the senses against the truth with no estimator, `--list` the runs, `--check` the truth beside the tests' own trial lines.

Found on the way: the tests' logged trial `heading` is 90° off the locator frame; the stream's heading, minus the yaw, is the locator-frame heading. With the right frame the corner reads land on their nominal angles, FL at 315°, FR at 0 to 45°, BR at 135°, BL at 180 to 225°, and the weak rungs are heard ahead and behind and fall silent abeam.

| estimator | locked | median lock | seconds under 30° | mean error |
|---|---|---|---|---|
| the agent's ring of 11-07 (`replay-baseline.mjs`) | 16 of 18 | 14 s | 41 % | 60° |
| the same senses into an evidence map (`replay-accumulator.mjs`), memory 5 s / 20 s / 60 s / never | 17 of 18 | 14 to 24 s | 45 / 54 / 60 / 65 % | 46 / 39 / 36 / 33° |
| every frame by its rung's measured profile, heard and unheard slots, corners ×3, never forgetting (`replay-bayes.mjs`) | 17 of 18 | 20 s | 68 % | 33° |

What the runs say about the layout: the belief must never forget, a memory of 5 s loses a third of the on-target time against no forgetting, and ageing the evidence by distance travelled hurts at every length tried (30 to 250 cm); the unheard slots are evidence too, without them every heard frame says "ahead" because the front receivers hear better; the strong rungs (8, 16) are flat and carry nothing, the weak rungs are heard 2 to 10 times more often ahead than behind, the corner reads are the one side-telling sense and worth about three frames each. The error falls with time as the frames accumulate: 116° in the first 10 s, 60° at 10 to 30 s, 23° at 30 to 60 s, 18° and 90 % on target at 60 to 120 s. The first 30 s are the frontier; the corner reads land in 2 to 4 % of the volleys in these runs, 30 % over the bridge, so a live seeker has more of them. The profiles are fitted on the same 18 runs, so these figures are an upper bound until unseen runs confirm them.

### Into the agent's ring

The bench runs the agent's own circuit (`CIRCUIT=<file>` for one built with `build-circuit.mjs` under other constants; `N`, `TAU`, `A1`, `A2`, `B`, `CORNER`, `CORNER_N` are environment parameters now, `OUT` the file). Found: the ring's leak of 250 ms is not what loses the belief on its own; a ring without leak, bounded by rescaling, reaches 46 to 49 % whatever the corner lobe, while the leaky ring at **36 neurons instead of 16 reaches 60 %** (62 with a quarter more recurrent gain, 59 with a quarter less), and the 16-bin map loses nine points against the 36-bin one. So the ring's first change is its size, 36 neurons at 10°; the recurrent weights go with the size (the old ones pinned half the ring at 1; 0.107 scored 42 %, 0.14 scored 54, 0.18 scored 52), and `circuit.json` is now the 36 ring at 0.14 / 0.07 / 0.0175 with the corner reads at gain 3: **53 %, 44°** on the bench against the 41 %, 60° of 11-07. The gradient pair `IR_APPROACH / IR_RECEDE` changes nothing on these runs.

Tried and reverted: the per-level evidence of the likelihood estimator fed into the ring as `IR_AHEAD / IR_BEHIND` neurons with inhibiting partners for the evidence against. Every variant scored below the old map (28 to 46 %), and the reason is structural: a ring neuron is `rate += dt/τ · (clamp01(input) − rate)`, a follower of the last 250 ms that the recurrence then holds; it does not sum, so small per-frame weights meant to add up over hundreds of frames count no more than one corner read once clamped, and with the sender behind every heard frame still says "ahead". The observation layer keeps the new sources, `frame.ch<k>` per level heard and `slot.ch<k>` per beat that went silent (`observation.slots`, with `ir.repeat`), for a belief layer that integrates; the map does not use them yet. The question for the agent: a layer that sums evidence, within the ring or beside it, aiming at the likelihood estimator's 68 %.

### Live runs

The mode's `seek` button runs the brain with the agent's motor layer from the plan's starts: the seeker rolls 1.2 m south by its navigation, then seeks; collisions armed on both, the tag rule, a time limit of 1.5 × 30 s/m, a runaway guard at 250 cm. `good` marks the last run for the bench, which takes only marked seek runs, the sender's place from the sheet in the mark. Runs of 2026-11-08, SB-9129 on SB-11DF: back to back at 23 cm, the 36 ring alone: tipped to the wrong half while facing the sender, pinned, drove off, stopped at 31 s. Same start, the summing layer on the ring: turned to the sender within 10 s, drove past, time limit at 45 s. From 1.2 m, the summing layer: approached, passed 20 to 30 cm west of the sender, drove on, runaway at 32 s; marked good. On that run the ring alone scores 3 % on target, the summing layer 26 % (78 % during the approach, then stale), with forgetting per 60 cm of travel 39 % and half the time after the pass: so the layer forgets by distance now, 60 cm.

**Ring plus distance.** The evidence a frame gives is a bearing from where the seeker stood; a belief that holds bearings goes stale as the seeker moves, and forgetting throws good frames away. So the layer became the ring plus ten distance neurons (`replay-ringdist.mjs`, drawn in `agent/brains/2026-11-08-ring-distance.svg`): the levels' measured range profiles (`--senses`, by 20 cm bands: strength 2 arrives under 80 cm, 4 under 140, 16 everywhere and most when far; the short ladder's 1 under 40 cm) feed the distance, and each locator step turns the ring by the parallax of the believed distance and shortens the distance along the bearing; nothing is forgotten. Bench: recordings 69 %, 30°; the marked run 42 % against the never-forgetting 26 %; with the parallax off exactly the never-forgetting numbers. Live, the path test of 2026-11-08: green driven by its navigation through twelve legs south of the starts (50 cm down, 50 right, 1 m left, 50 right, 30 down, 60 right, 1.2 m left, 60 right, twice) with blue sending from its start; at the twelve corners the ring was 21° off the true bearing on average, never on the wrong side or half, and the user saw the matrix point at blue about 90 % of the time and turn with every corner and U-turn; the believed distance ran at about half the truth out to 1.3 m, the range profiles being skewed near (the recordings held the sender close, and the short ladder's levels say near whenever it is on): to refit.

The range profiles then went by physical strength instead of by channel: the short ladder is only sent when the brain believes it is near, so its channels had only been recorded near and said 20 cm for a frame heard at a metre; by strength the distance bias on the recordings fell from −6 to +1 cm (mean |off| 35 → 28 cm), on the day's runs from −27 to −16, and the direction gained with it (72 %, 28° on the recordings). **The first find with the new layer, run 7 of 2026-11-08:** from the pre-roll's 122 cm the seeker reached blue in **23.5 s, 19 s per metre**, under the 30 s/m goal, the tag from both collision reports, 8 landed reads of 237; marked good, the user: extra good, the collision happened, no extra legs, the most convincing run in days; a row in the agent's ledger. The run before it, same layer with the near-biased distance, looped round blue at a metre and ended on the time limit (marked good too).

Open, the user's point: a seeker with low confidence should move to get better data, orthogonal to the axis or a spiral out, rather than roll on; only the corner reads tell a side, so heading in needs confidence first. Motor policy, for the agent once the runs are repeatable.

## Step 2

New data against the ring: the camera's track of both Bolts, the user's judgement by eye, volley timing over Web Bluetooth. Open until step 1 runs.

## Open

- Full green: the vector length that counts as full confidence. Set from the first run's log.
- Which Bolt sends: fixed in code or chosen in the header.
- Whether matrix column 7 is the Bolt's right side: the camera cannot resolve the test stroke, the eye decides.
- Reads land in about 2.5 % of the volleys over Web Bluetooth against 30 % over the bridge: the volley lead is for step 2.
- The first reading, both Bolts at their reference places, green's nose SW, blue to its west: the ring said 45° off the nose, which is where blue is.
