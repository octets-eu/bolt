# Palette runs plan

**Backlog 04 of `docs/hide-and-seek.plan.md`.** One ladder for the game, chosen on the bench from recordings that hold every strength; the brain is built for it. No number of a room is written in code.

## Goals

1. **The palette.** Eight strengths on the eight infrared codes, fixed, so a frame's code names its strength in every recording.
2. **The palette recordings.** The reference runs with the sender on the whole palette, the camera's track beside them, for all three Bolts, each sender once and seeker once. They are recorded once.
3. **The bench plays a palette recording as any ladder.** It hands the replayed brain the frames, the silent slots and the reads of the levels a ladder holds and withholds the rest, so a ladder is judged and changed without new runs.
4. **One ladder.** The game sends a single ladder, a choice of strengths from the palette on the palette's codes: no second ladder, no switch. Its levels lie far enough apart in strength that every stretch of the room has one level heard ahead and behind and silent abeam.
5. **The brain for it.** The builder draws the brain from the chosen ladder; the seeks find the sender on it, by the user's eye and the bench.

## What exists

- `PALETTE` in core: the strengths 1 to 128, a factor of two apart, weakest first, on the codes 7 down to 0.
- `Survey.ladder`: a standing measurement, one Bolt sending the palette, the other hearing it through the brain's observation layer while turning to headings; `bench/ladder.mjs` counts it.
- `Survey.coil` with the camera's track: reference runs with a true place, the sender held on a ladder by an option.
- The bench: `bench/replay.mjs` scores a brain over recorded runs, `CIRCUIT=<path>` scores a circuit under test; a seek that ended in the tag has its locator path stretched to it.
- The builder draws every level's weights from its strength.

## Rules for every step

- One step, one commit; its check and its measurements go in the commit message.
- The seeks stay as they are until step D: `node bench/run.mjs` gives equal digests before and after every step up to C.
- A Bolt is named by its role and its colour.
- Nothing is weighed by hand in this plan: a candidate ladder's brain comes from the builder.

## Steps

### A, the palette

- **A1** (**done**) the palette's strengths and their codes, in core beside `LADDERS`: eight strengths a factor of two apart, the weakest on the code that loses frames at the far end (core-brain plan's Open). Check: `Survey.ladder` with the palette at two distances, every strength counted by `bench/ladder.mjs`.

### B, the bench on the palette

- **B1** the reference runs with the palette: `Survey.coil` holds the sender on the palette; the two coils and the two near runs are recorded, the camera's track beside them, for each of three pairings of the three Bolts, every Bolt sender once and seeker once: Sender/blue with Seeker/green, Sender/green with Seeker/amber, Sender/amber with Seeker/blue; twelve runs. They are kept apart from the scored runs until B2. Check: every strength sent the same number of times; the track as good as the coils' today.
- **B2** the replay plays a ladder out of a palette recording: `--ladder` with a list of strengths withholds the other levels' frames, slots and reads. Check: one ladder played out of a palette coil holds that ladder's frames and no other's; its round is the palette's, so each level comes half as often as it would live, and the commit message says what that costs on today's ladder's levels.
- **B3** the table from the recordings: per strength the share of sends heard by distance, by the sender's side off the nose and by pairing, and the share of corner reads that name a side. Check: for Sender/blue and Seeker/green its shares against those counted from today's reference runs, for the strengths both hold.

### C, the ladder

- **C1** the builder builds a brain for one ladder given as strengths of the palette: its channels the palette's codes, a cell per level as today, and without the short ladder, its request and the near rule. What leaves the circuit is shown in full before the step starts. Check: built for today's long ladder alone, the cells of its four levels carry today's weights.
- **C2** the candidates on the bench: 1, 4, 16, 64; 2, 4, 16, 64; 1, 2, 4, 16, 64, each with its brain from C1, played out of the twelve recordings by B2. Per candidate and pairing the share of seconds under 30° and the mean error, and both again for the stretch nearest the sender, where the candidates differ. The user chooses.

### D, the switch

- **D1** the game's ladder in core is the chosen one, on the palette's codes; the short ladder, the referee's switch and the brain's request leave; the recordings on the old ladders move to the archive, and the twelve palette recordings, played as the chosen ladder, are the bench's set. Check: the bench's numbers are C2's for that ladder.
- **D2** live: seeks from the three starts on the chosen ladder, marked and extracted into the bench. Check: found, by the user's eye and the bench.
- **D3** live with the roles turned: a seek for each of the two other pairings. Check: found.

## Parked, for a shipped game

- **A palette run in a room nobody measured.** The sender sends the whole palette; the seeker works its way to it by stations, standing and turning a full circle, and short legs between them; the run is accepted only when it ends in the tag. It needs no reset point: distances are counted back from the tag on the seeker's own locator. It may take its time, turn as often as it needs, drive left or right until it touches something, and the sender may turn too. What it meets: obstacles, echoes, an uneven floor.
- **A profile per room and pair of Bolts** from accepted runs, and the ladder computed from it.
- **A screen:** start; accepted or not; the ask to run again from another place.
- **The reaches corrected from the game itself:** every seek that ends in the tag says, counted back from it, how far each level was heard; the brain's reaches follow.

## Open

- Hearing while standing and hearing while driving differ. The builder's share of sends heard inside a level's reach is the drive's and stays a drawn constant.
- Strengths 32 and 64 are not in any driven recording before B1.
- A recording made on the palette gives each level half as often as a ladder of four sends it. Whether the bench on such recordings judges a ladder fairly is B2's measurement; if not, the chosen ladder's reference runs are recorded on the ladder itself after D1.
- Seeker/green sends no collision event for some touches the sender reports, and many while it drives free. Every seek's tag hangs on it; it is backlog 05 of `docs/hide-and-seek.plan.md`.
- With the ladder changed, W2 of `docs/core-brain.plan.md`, the far weights, is drawn for the new levels, after D.
