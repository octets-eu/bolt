# Palette runs plan

**Backlog 04 of `docs/hide-and-seek.plan.md`.** One run in a room measures how this pair of Bolts hears every strength there; the ladders, the bands, the weights and the limits are computed from it. No number of a room is written in code.

## Goals

1. **The palette.** Eight strengths on the eight infrared codes, fixed, so a frame's code names its strength in every palette run. A ladder is a choice of strengths from the palette; its codes stay its own, as today.
2. **The palette run.** The sender stands and sends the whole palette, round after round. The seeker starts across the room, in line of sight, and works its way to the sender. The run is accepted when it ends in the tag, and only then.
3. **The profile.** What accepted runs measured, as data per room and pair of Bolts: per strength the share of sends heard by distance and by the sender's side off the nose, and the share of corner reads that name a side.
4. **Ladder and brain from the profile.** The ladders, the distance bands, the weights and the limits are computed from the profile. A new room or a new pair is a new run and a rebuild, nothing is tuned by hand.
5. **The bench plays a palette recording as any ladder.** It hands the replayed brain the frames, the silent slots and the reads of the levels a ladder holds and withholds the rest, so a ladder is changed without new runs.
6. **A screen.** The user places the Bolts and presses start; the screen shows the run, says accepted or not, and asks for another run from a different place when the profile needs one.

## What a palette run meets

- **Obstacles.** A table leg, a wardrobe: found by contact, passed by a step to the side.
- **Echoes.** Light that arrives by way of the room is part of what the profile measures. Where a level's reads name all four corners it tells no side there, and the limits say so.
- **An uneven floor.** The drive follows the locator's speed, the command rising until the Bolt moves.

What it may use:

- **Time.** A palette run is a measurement, not a game: it has no seconds per metre to keep.
- **Turns.** The seeker turns in place as often as it needs.
- **Contact.** The seeker drives left or right until it touches something, as often as it needs.
- **The sender.** It may turn in place too.

## What exists

- `Survey.ladder`: a standing measurement, one Bolt sending any strengths on any codes, the other hearing them through the brain's observation layer while turning to headings; `bench/ladder.mjs` counts it.
- `sweep` (core, behavior): a standing turn that finds the sender's direction from the frames and the corner reads.
- `reach` (core, behavior): a roll to a locator point that feels contact by the pitch, charges a lip and reports blocked.
- `rollToPoint` (core, navigation): the speed following the locator's, so the Bolt breaks free on any surface.
- The infrared actuator takes a strength per emitter: front, left, right, rear.
- The tag: both Bolts' collision events within a moment of each other (the runner).
- The rubber band (`bench/replay.mjs`): a run that ended in the tag has its locator path stretched to it.
- `Survey.coil` with the camera's track: reference runs with a true place, the sender held on a ladder by an option.

## Rules for every step

- One step, one commit; its check and its measurements go in the commit message.
- Standing before driving: what a step measures, it measures standing; the drives only move the seeker between places.
- The seeks stay as they are until step I: `node bench/run.mjs` gives equal digests before and after every step up to H.
- A run that does not end in the tag gives no profile, whatever it heard.
- A step that needs a number of this room takes it from a profile, not from a constant.
- The brain's cells for the palette's levels, where a step needs them, come from the builder; nothing is weighed by hand in this plan.

## Steps

### A, the palette

- **A1** the palette's strengths and their codes, in core beside `LADDERS`: eight strengths a factor of two apart, the weakest on the code that loses frames at the far end (core-brain plan's Open). Check: `Survey.ladder` with the palette at two distances, every strength counted by `bench/ladder.mjs`.

### B, the bench on the palette

- **B1** the reference runs with the palette: `Survey.coil` holds the sender on the palette; the two coils and the two near runs are recorded once more, the camera's track beside them. Check: every strength sent the same number of times; the track as good as the coils' today.
- **B2** the replay plays a ladder out of a palette recording: `--ladder` with a list of strengths withholds the other levels' frames, slots and reads. Check: today's ladder played out of the palette coils against today's coils, both numbers reported; the difference is the price of the longer round.
- **B3** the profile from a recording with a true place: the table of goal 3 from the palette's reference runs, written as a file. Check: for the strengths both hold, its shares against those counted from today's reference runs.

### C, contact

- **C1** one sense for "the seeker touches something", for the tag and for obstacles: the collision event, the pitch (`reach`) and the locator's speed against the command are measured against the sender, a wall, a furniture leg and a free drive. Check: every touch reported, no report on the free drive; the tag is the seeker's contact and the sender's collision event together.

### D, the station

- **D1** the seeker stands, turns through the full circle in steps and hears whole rounds of the palette on each heading, the corners read into every frame; the sender turns a quarter between the seeker's circles, so no emitter decides a count. Result: per strength and heading the sends, the frames, the reads that hit and the corners they name. Check: on a reference point at three distances the counts against A1's.
- **D2** the direction from a station: the axis from the headings on which the weakest arriving strengths are heard, its end from the corner reads, as `sweep` finds it. Check: on reference points at three distances the direction against the sheet's.

### E, the leg

- **E1** a leg from a station toward the direction found, of limited length, by `reach`'s loop: the speed follows the locator's, contact ends it. Check: legs on the floor and over the mat's lip end where asked.
- **E2** the obstacle: contact without the sender's report is something in the way; the seeker backs off, steps left or right until it is free or touches again, and stands for a station. Check: a box in the line of sight is passed, on either side.

### F, the palette run

- **F1** stations and legs until the tag. It ends as accepted at the tag, or as not accepted with its reason: nothing heard at the start, lost, blocked, out of budget. The session holds it as a path for the bench. Check: three runs from the room's far end accepted, one of them with an obstacle; a run with the sender covered ends as not accepted.

### G, the profile from runs

- **G1** an accepted run into the profile: the rubber band gives every station its distance, the stations' counts fill the table of B3; accepted runs add up. Check: the profile of two runs against B3's, the camera's.
- **G2** what a profile lacks: a stretch of distance without a station, or a strength whose reach lies between no two stations, is named, with the place to start the next run from. Check: a run started halfway leaves the far half named.

### H, the ladder from the profile

- **H1** the ladders computed: the strongest level is the weakest strength that still arrives at the farthest station, the levels below it are those whose reaches divide the way, the short ladder those that fall off near the sender; a level's reads count from the distance where they name a side. The rule is shown in full before the step starts. Check: the ladders computed for this room beside today's; played on the bench by B2.

### I, the brain from the profile

- **I1** the builder reads the profile: the levels' reaches and the distance bands come from it where they are drawn constants today. Check: the bench on B2's ladder, both numbers against the brain before.
- **I2** live: seeks from the three starts on the computed ladder and the built brain, marked and extracted. Check: found, by the user's eye and the bench.

### J, the screen

- **J1** in the app: start; the stations done and the strengths heard so far; accepted with the profile's table and the ladders, or not accepted with the reason; the ask to run again and from where (G2). Check: the user runs a room from the screen alone.

## Open

- Hearing while standing and hearing while driving differ; the profile measures standing, the seek drives. What the builder takes from the profile and what stays a property of the drive is I1's question.
- The rubber band stretches a path evenly. A palette run's path has stops, contacts and steps to the side; whether an even stretch holds for it is checked in G1 against the camera.
- Echoes are measured, not told apart from the direct light. A station with the sender lighting one emitter would tell them apart; no step needs it yet.
- Seeker/green sends no collision event for some touches the sender reports, and many while it drives free. C1 starts there.
- One code a strength in the palette, two ladders with codes of their own in the game: whether the game's ladders move onto the palette's codes is decided with H1.
- W2 of `docs/core-brain.plan.md` redraws the far weights by hand; I1 computes them. Which of the two is done, and when, is the user's.
- The top-level plan's later goals, more torque over bumps and driving around furniture legs, are the seek's. E1 and E2 solve them for a run that may stand and take its time.
- The screen of the shipped game is `apps/play`'s; J1 is the browser app's.
