# Learnings for the core brain plan

**A staging note.** It collects what the survey work shows, to be folded into `docs/core-brain.plan.md`; once folded, this file goes. Every number names its run; the runs are in `bench/` and the commit messages carry the full measurements.

## 1 The link is shared, infrared goes first

- One Bluetooth link per Bolt carries its rolls, its corner reads, the listen's re-arm, the motion stream and every ack.
- Measured on the spiral survey with Seeker/green on u1 and Sender/blue on d1: a drive that rolls on every motion sample, 13.4 and 13.8 rolls a second, leaves 32 and 43 % of the corner reads without an ack and loses 21 and 22 of the listen's re-arms (bench runs 33 and 32). The same drive at one roll every 280 ms, 3.0 a second, leaves 9 % without an ack (bench run 34). Seeks that roll 3.1 to 4.0 times a second leave 0 to 1 % (bench runs 21, 23, 28, 29, 30).
- Today the rule lives in each drive's own care: the brain rolls right after a volley, the `archimedean` behavior limits its own rate. Nothing enforces it.
- For the plan: the observation layer owns the link's timetable and answers whether the link is free; the motor rolls on its own clock and yields to a volley. The same gate belongs to core's command queue, so every drive code obeys it without knowing who reserved the link.

## 2 Rolls tied to volleys freeze the seeker in silence

- The brain sends a roll only after a volley has come back; before the first frame a timer rolls instead and is then off for the run. Volleys go only to frames the seeker expects, and a channel leaves that schedule `expectMs`, 3 s, after it was last heard.
- So silence stops the rolls. Measured in bench run 31, Seeker/green from u1, Sender/blue on d1: the seeker drove out of the sender's line of sight behind the partition, the last frame came at 39.4 s, the last volley and the last roll at 42.6 s, and it drove on its last command at seek speed for 7.7 s until the user stopped it at the chest.
- For the plan: what the motor does without frames is a decision of the brain, from the belief and its confidence; it can only be one when the motor keeps being asked. Losing the line of sight is the normal case of the game.

## 3 The read schedule drops the only channel that still arrives

- Measured on bench run 34 by the camera's distance from the sender: 150 to 200 cm 1.49 frames a second and 13 hits in 243 reads fired; 200 to 250 cm 1.73 and 23 in 458; 250 to 300 cm 0.97 and 8 in 320; 300 to 350 cm 0.36, strength 16 alone, and none in 71.
- Beyond 3 m one frame arrives about every 3 s, which is the schedule's `expectMs`: after each frame heard three rounds get a volley, then the seeker stops reading until the next frame. The reads thin out exactly where each one matters most.
- The sender's beat is 200.00 ms in every run measured, with 4 to 7 ms of jitter per send, so a channel's next frame can be predicted far longer than 3 s.
- For the plan: the last heard channel stays on the schedule for about 10 s; the others leave it at 3 s as today.

## 4 The ladder has to reach 4 m

- The long ladder sends strengths 2, 4, 8 and 16; the emitters go to 255; of the eight infrared codes seven are in use.
- On bench run 34 strength 2 is not heard anywhere between 150 and 350 cm from the sender, strength 4 to 250 cm, strength 8 to 300 cm, strength 16 alone beyond.
- For the plan: the ladder is measured and chosen by survey before the brain's far weights, since which levels arrive is the brain's cue for distance. A level added on the free code keeps every recorded run valid; changing the strengths behind the codes in use retires the bench's recorded runs. The user's word: with a new ladder the old runs retire, and a reference run takes their place.

## 5 What a new ladder asks of the brain

- Adapts by itself: the builder makes a frame cell and a slot cell per channel of the observation block; a ladder's round follows from its number of channels; the sender sends what core's `LADDERS` lists.
- To be drawn: the weights of the new levels' frames and silences onto ring and distance, and the distance bands, which end at 190 cm today. This is W2.
- Written into code today: the "near" rule asks for the short ladder when the long ladder's strength 2 is heard three times; it holds only while strength 2 stays that ladder's weakest level.
- The brain tab's anatomy has four places for long channels and three for short ones; a further channel needs its place.

## 6 The survey is the instrument

- The phone over the floor gives a Bolt's true place: its lit matrix found against a dark frame (`tracking/glow.ts`), mapped to the floor by a fitted pose (`tracking/floorcam.ts`). With both Bolts standing on reference points the camera puts them 2.1 and 0.7 cm from the points.
- A run's frames are saved beside it outside the page (`bench/camrec.mjs`) and turned into its track afterwards (`bench/camtrack.mjs`); the camera's lag is found per run, 2.25 and 2.5 s on the two spirals. Camera and locator lie 8.4 to 9.5 cm apart in the median over runs of 70 to 170 s; the locator's spiral comes out about a tenth larger than asked.
- `bench/ref/` holds reference runs by name, tracked: the session's cut, the camera's track, the image. `ref/archimedean` is the spiral round u1.
- `ref/coil` is the next one; `target.png` is its agreed path: Sender/blue on d1, Seeker/green from u2, a spiral out round u2 to 50 cm, loops creeping down the line to d1 as wide as the floor allows, a last spiral round the sender from 50 cm in to 20 cm. It covers 20 to 365 cm on the line of sight and shows the sender every side of the seeker at every distance: the data to confirm a ladder over the range, to score the present brain and to draw the next one's weights from.
- The camera's picture ends 15 to 20 cm beyond u2; the track beyond it is bridged by the locator between the camera's points.

## 7 Open

- Bench run 31 heard 37 frames in its first 39 s with the line of sight free, and none of its 184 corner reads hit; reads were timed as in runs that hit (a read 30 to 70 ms before 74 % of the frames, acks in 46 ms). Not explained.
- Of the corner reads fired at 2.4 and 3.2 m with the seeker standing, 7 to 11 % get no ack with no rolls at all (bench runs 20, 22). Not explained.
- After a reload by the dev server the page finds no Bolt within 12 s in 40 of 102 recorded cases, after a reload by hand in 28 of 118; the cases with the Bolts asleep are not told apart.

## 8 Where it goes in the plan

| Order | Step | What |
|---|---|---|
| 1 | L1 | the live baseline finished: the seek from 2.4 m repeated, the one from 3.2 m run |
| 2 | F, the field (new) | the survey as the plan's instrument: the coil behavior, the camera's track with its bridging, the read schedule keeping the last heard channel |
| 3 | B3 (new) | the link gate between observation and motor, and in core |
| 4 | R, the reach (new) | the ladder to 4 m, measured and chosen on the coil |
| 5 | C1 to C3 | the generic network, unchanged, independent of the steps above |
| 6 | W1, S1, S2 | unchanged |
| 7 | W2 | far weights and bands, for the ladder of R; its 3.5 m becomes the ladder's reach |
| 8 | M1 (new) | the motor's answer to silence, from belief and confidence, as cells of the circuit |
| 9 | D1 to D5, L2, L3, E | unchanged |

Three points are the user's to settle: L1 before or after R; whether 4 m is the ladder's reach alone or also L3's test range, which the goal sets at 0.5 to 3.5 m; M1's place, here after W2 since confidence follows from the weights, or right after B3 since the freeze spoils far seeks.
