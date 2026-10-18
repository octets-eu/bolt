---
title: Behaviour
purpose: The behaviors in packages/core/src/behavior, closed loops over the Bolt's own senses, what each does and the measurements it rests on
type: reference
status: sweep frozen 2026-10-11; reach and lockOn as measured 2026-09-23 and 2026-10-01
tags: [bolt, behavior, infrared, reference]
---

# Behaviour

A behavior is a closed loop over the Bolt's own senses with a fixed setpoint and a budget, one per file in `packages/core/src/behavior/`. It commands the motor itself, uses no navigation step, and returns a result with a reason instead of throwing. Called as `bolt.behavior.<name>()`; each call is a step in the session log, `behavior.<name>.in` with the arguments and `.out` with the result.

| Behavior | Setpoint | Senses | Reasons |
|---|---|---|---|
| `reach(target, tolerance)` | a locator point | locator, pitch | reached, blocked, budget, aborted |
| `lockOn(channel)` | facing a sender | infrared notifies, receivers | collision, all round, aborted |
| `sweep(options)` | the direction of the Bolt that sends the ladder | infrared notifies, receivers, yaw | direction, axis, nothing, aborted |

## sweep

**What it does.** The other Bolt sends the ladder, `communication.sendLadder()`: strengths 2, 4, 8, 16 on channels 0 to 3, one frame per 200 ms, a round of 0.85 s. The seeker turns through `span` degrees, 180 by default and centred on its heading, in steps of `step`, 15 by default, stands one round at each heading and counts the frames per level. From the headings where each level was heard and where it was silent it fits the sender's axis; from timed reads of its four receivers it tells which end of the axis the sender is on; then it turns to face it. Code: `behavior/sweep.ts`, the beat and the reads in `behavior/beat.ts`, the ladder in `communication/communication.ts`.

**The result.** `reason` is `direction` when axis and end are known, `axis` when no read named an end and the axis is taken as ahead, `nothing` when no level was heard at some headings and silent at others, `aborted` on fullstop. With it the heading, the axis, the levels the fit used and its score, the hits for either end, the frames per level, the volleys and hits, the beat's counts and the seconds.

**The facts it rests on.**

- A level that is just arriving at the seeker's distance is heard with the sender within about 60° of the fore-aft axis, either end, and not abeam; a stronger level is heard all round, a weaker one not at all. Seek-edge runs 1 to 8 (2026-10-10/11), strength 4 heard per round by the sender's bearing off the nose:

  | Distance | ahead, under 45° | 45° to 75° | abeam, 75° to 105° | 105° to 135° | behind, over 135° |
  |---|---|---|---|---|---|
  | 1.0 to 1.6 m | 36 % | 23 % | 6 % | 31 % | 73 % |
  | 0.6 to 1.0 m | 64 % | 63 % | 27 % | 53 % | 100 % |

  Strength 8 at 1.0 to 1.6 m: 85, 79, 31, 70, 82 %. Strength 16 there: 92, 92, 83, 95, 92 %.
- Which level is the one just arriving depends on the distance: 2 up to about 80 cm, 4 at 0.6 to 1.0 m, 8 at 1.0 to 1.7 m, 16 beyond that; 16 reached 4 m facing on 2026-10-02, the weakest that did. Beyond that nothing arrives: a sweep at the far end of the room heard no frame at 13 headings and gave `nothing`.
- Dropped frames are the rule: strength 4 arrived in 10 to 50 % of its rounds inside the lobe at 1.0 to 1.5 m, varying run to run. So the fit weighs a frame outside a candidate's lobes at −2, a silence inside at −0.5 and a match at +1, over every level heard at three headings or more and silent at two or more; a single silence never decides. The standing start of seekEdge, which declared the lobe's edge on the first silence, did so inside the lobe in 5 of 8 runs.
- The rear lobe hears as well as the front one: at 1.3 m strength 4 was heard behind in 85 % and 83 % of the rounds, ahead in 56 % and 83 % (seek-edge runs 1 and 2). The notifies give an axis, not an end.
- The four receivers sit at the corners, front left, front right, back right, back left. A read of them (0x22) shows the channel only while a frame is in the air, 7.5 ms; timed to the sender's beat, three reads 6 ms apart caught 43 % of the frames at 80 cm (2026-10-04). In the sweep trials the hits were 0 to 8 per sweep, 10 to 20 % of the volleys, more close in. A hit puts the sender within a quadrant of the heading plus the mean of the corners that heard, 45° off the nose in front and 135° behind; the end of the axis nearer to that takes the hit.
- The notifies scatter 20 to 25 ms around the beat, period fitted, with the motion stream on or off; the sender's command timing is not the cause either, since from command to notify the delay is flat from 50 to 250 ms. Open.
- The motion stream runs only while the ball turns; the heading is read at the end of each turn.

**Trials, 2026-10-11.** `Bolts.sweepTrials`: blue sends from its place, green is set down by hand anywhere in the 4 by 6 m room, in any direction, armed by a tap, and judged by eye at the end. The user went on while the chevron was within 30° of blue.

| Routine | Rule for the axis | Trials | Outcome |
|---|---|---|---|
| 1 | longest arc of one level, end by hits within 40° of the axis | 1 | axis within a few degrees, end wrong: 1 hit in 51 volleys, off the zone |
| 2 | same, motion stream off during the rounds | 3 | last one off by 160°: the three hits were right and outside the zone |
| 3 | same, every hit votes by its corners | 5 | 4 within 30°; the fifth at about 4 m off by 60°, no hit, strength 8 at three headings as carrier |
| 4 | carrier needs a lobe inside the sweep | 1 | no direction though pointing at blue: strength 16 silent at two headings, 8 at three |
| 5 | the fit over all informative levels | 7 | 6 directions, hits 6, 2, 0, 1, 1, 6; one `nothing` with no frame heard; judged good |

Three directions in routine 5 rested on a single hit. The levels the fit used were 2 close in, 4 and 8 at a metre or two, 16 at range.

**Record.** In the session log: `sweep start` with the constants, one `sweep` line per heading with target, heading, frames per level, volleys and hits, `sweep axis` with the levels used, the fit, the hits' bearings, the vote and the direction; the trials as `sweepTrials {n, ...result}`.

## reach

Rolls to a locator point over what can be charged over; motor commands only. Contact at exploring speed shows as pitch above 30° held, 8 of 8 at the mat lip and a wall; the locator does not show it. Lip and wall look alike at contact, so a charge is also the test: the lip was crossed 3 of 3, the wall blocked 2 of 2. After a charge the locator is off by an unknown amount, so the obstacle is the reference: when the ball first rolls free, its position is set to where the charge was meant to end. Measured 2026-09-23 (`behavior/reach.ts`).

## lockOn

Turns to face a Bolt that sends one channel weakly, by the listen notify: finds both edges of the zone it hears in, in 20° steps halved to 5°, aims at their middle, and takes front or back from the first 0x22 reading on one pair, which came in 1 to 4 % of the polls. At 50 cm a receiver hears a strength 2 frame within about 60° to 70° of its front and of its back and is deaf at both sides. Measured 2026-10-01 (`behavior/lock-on.ts`). The sweep supersedes it for direction finding: it uses every level of the ladder and timed reads.
