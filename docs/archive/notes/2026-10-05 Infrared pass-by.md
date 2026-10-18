---
title: Infrared pass-by and a first drift number
purpose: Brief results of 2026-10-05 and the decisions taken from them, with their reasons
type: record
measured: 2026-10-05, SB-9129 (green, sends), SB-11DF (blue, rolls)
status: two runs, one passing distance; not yet repeated at other distances
tags: [bolt, infrared, locator, record]
---

# Infrared pass-by and a first drift number

**Purpose.** What the two pass-by runs and one round trip showed, and what
was decided. The counts per leg are in the session log of the day
(`passBy leg n`); setup and numbers are also in the header of
`packages/core/src/experiments/pass-by.ts`.

## Setup

- Hard floor, in the opening of the partition. Both Bolts reset on their start points ([[Protocol#9 Takeover, reset, stop, fail]]).
- Green stands 25 cm from the left partition end, facing the line, and sends a strength ladder, one frame per 200 ms.
- Blue rolls a 3 m line that passes green at 72 cm, four legs (two each way), about 11 cm/s. It counts the listen notifies per strength and per 10 cm of the line.
- Positions and bearings are taken from the locators.

## Results

Heard of sent, by green's bearing from blue's front.

**Run 1, ladder 2, 4, 8, 16:**

| Bearing | Strength 4 | Strength 8 | Strength 16 |
|---|---|---|---|
| 30 to 45° | 22 of 23 | 24 of 23 | 25 of 23 |
| 75 to 120° (abeam, 75 cm) | 2 of 23 | 8 of 23 | 25 of 23 |
| 135 to 150° | 20 of 23 | 16 of 23 | 21 of 23 |

Strength 2: 4 notifies in the whole run. Strength 4 at 155 cm, ahead or behind: 7 of 28.

**Run 2, three neighbouring strengths moved by what blue heard:**

| Bearing | Strength 2 | Strength 4 | Strength 8 |
|---|---|---|---|
| 15 to 75° | 8 of 38 | 47 of 67 | 56 of 68 |
| 75 to 120° (abeam) | 0 of 22 | 2 of 29 | 18 of 24 |
| 120 to 150° | 1 of 25 | 30 of 42 | 34 of 37 |

The ladder moved 19 times in 118 s. On two of four legs it moved up at abeam (102° and 109°). Strength 4 got 30 % of the frames, against 25 % in run 1.

**Round trip, 1 m up and 1 m back** (before the pass-by): the locators said 1.2 cm (green) and 1.3 cm (blue) from the start; on the floor green was 8 cm short and blue 1 cm.

## Readings of the numbers (not measurements)

- The weakest strength that arrives is heard ahead and behind and falls silent while the sender is abeam. Both runs show it for strength 4.
- The strength above it does not reliably drop abeam: a third in run 1, three quarters in run 2.
- The listen notifies are enough to see the silence; no read of the receivers is needed.

## Decisions

- **Fixed ladder.** The moving ladder gained 5 points of usable frames and mistook abeam for "too far" twice, because it relied on the strength above the weakest. `passBy` now sends a fixed ladder, 4, 8, 16 by default.
- **Next: the seeker uses the silence of the weakest strength.** It comes with every frame of that strength, where a read of the receivers catches 35 to 43 % of the frames at best ([[2026-10-04 Infrared timing]]).
- **No extra hardware against drift.** A home corner, narrow beacons or a camera above the start would help, but the game should not need a list of hardware. For now the user judges whether the plot still matches the floor, and otherwise puts the Bolts back on their start points and resets.

## Seeker on notifies, two runs

`seekToCollision`, blue seeks, green sends 4, 8, 16 from 1.5 m, facing blue. Details are in the header of `packages/core/src/experiments/seek-to-collision.ts`; every round is in the session log as `seek`.

- **Run 1 (27 s).** The belief was fed by 24 of 31 ladder rounds. The sweep put the sender 24° off. After five rounds toward it, one silent round tipped the belief to the opposite end of the line and blue rolled away. Reason: the shape gave 0.75 ahead and 0.70 behind, and notifies cannot tell the two.
- **Run 2 (2 min).** Ahead and behind made equal, a standing check with timed reads added. Sweep 5° off; the check read front 0, back 2 and took the right half; blue rolled 2 m straight, passed green by about 30 cm (seen on the floor) and went on into the furniture. Strength 4 was missing in three of the last four rounds before the pass. It never turned.

**Decisions.**

- **A pass rule beside the belief.** Two silent rounds in a row after the weakest strength had been arriving stop the ball; timed reads then count left receivers against right ones. Reason: 13 heard rounds had made the belief too sure for four silent ones to turn it, and a blind approach from 1.5 m needs under 3° to hit a 7 cm Bolt, so a pass is the normal case.
- **Sweep stops and read replies are logged** (`seek`, `seek reads`). Reason: the left-against-right decision rests on those reads, and they were not in the log.

The pass rule is built and committed but has not run.

## Open

- The gap at other passing distances, and for strengths 8 and 16 at their own edge of reach.
- `passBy` with the fixed ladder 4, 8, 16 has not run in that form.
- Drift: one round trip is one number per Bolt.
- Both locators changed while the Bolts stood between two runs (green by 23 cm, blue by 9 cm along their own axis, yaw unchanged). Not explained.
- The check got 2 reads naming a receiver pair in 20 beats at 1.5 m, against 35 to 43 % of frames standing at 80 cm.
- The ending of `seekToCollision` needs both collision reports; whether a slow touch gives them is not known.
