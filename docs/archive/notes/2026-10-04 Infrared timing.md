---
title: Infrared timing between two Bolts
purpose: The measurements of 2026-10-04 on when a Bolt sends and when a read of the receivers catches the frame, setup and numbers only
type: record
measured: 2026-10-04, SB-11DF (blue, sends), SB-9129 (green, reads), M5 beacon as recorder
status: kept as measured; one distance, standing; not yet repeated
tags: [bolt, infrared, timing, record]
---

# Infrared timing between two Bolts

**Purpose.** Raw results for the question "how often can a Bolt read which
of its four receivers hears the sender". Setup and numbers. Readings of the
numbers are marked as such.

**Why it matters.** The notify "message heard" says a signal is there, not
where from. Only a read of the four receivers can say that, and only when
it lands while a frame is in the air and the receivers do not all agree.
The number to raise is useful reads per second.

## Contents

- [[#Setup]]
- [[#Run 1 Delay between send and read]]
- [[#Run 2 One read timed to the beat]]
- [[#Run 3 Two reads, the second before the first is answered]]
- [[#Run 4 Three and five reads per frame]]
- [[#Run 5 Three reads on every beat]]
- [[#Run 6 Two send commands per cycle]]
- [[#Run 7 Two send commands timed to the beat]]
- [[#Readings of the numbers (not measurements)]]
- [[#Code]]
- [[#Open]]

## Setup

- Blue and green on a hard floor, 80 cm apart, facing each other, standing still.
- Blue sends with "send infrared message", same strength on all four emitters. Runs 1 to 5: channel 2 at strength 4.
- Green reads its receivers with "infrared readings" (0x22). The reply holds one value per receiver: front left, front right, back right, back left; the channel heard, or 255 for none.
- Green arms "listen" again after every notify, as the listen ends with the first message.
- A "hit" is a read whose reply holds the channel on at least one receiver.
- Times are the page's clock. All runs are in the session file `session-2026-10-04T15-14-05-377Z.jsonl`, each between a start and an end note ("sync scan", "beat lock", "paired reads", "volley reads", "volley reads 2", "two sends per beat", "straddle sends").

Baseline from the same day, before any timing: in a 60 s run with green rolling and reading as fast as the link allows, 6 of 1041 reads were hits. A read took 45 ms from command to reply (38 to 61 ms for 10 to 90 % of 1042 reads), a send 36 ms (27 to 54 ms, 296 sends).

## Run 1: Delay between send and read

The page told blue to send and green to read, with a fixed delay between the two commands. Eleven delays, 40 tries each, one try per 250 ms.

| Delay, read after send | -40 | -30 | -20 | -10 | 0 | 10 | 20 | 30 | 40 | 50 | 60 ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Frames heard as a notify | 31 | 23 | 28 | 32 | 32 | 33 | 33 | 34 | 40 | 32 | 33 |
| Hits | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 2 | 0 |

- 440 tries, 351 notifies, 4 hits.
- From the send command to the notify: 0 to 259 ms, half of them under 106 ms, 10 to 90 % between 15 and 218 ms.
- The notifies arrived on a period of 200.44 ms, scattered by 14 ms around it, while the send commands were 251 ms apart. Gaps between notifies were about 200 or about 400 ms.
- All 4 hits were reads issued 41 to 46 ms before a notify arrived.

## Run 2: One read timed to the beat

Blue sent every 200 ms. Green took the first 15 notifies as the beat (period 200.44 ms), moved it by a fifth of the error at every later notify, and issued one read per beat a fixed time before the next expected notify.

| Read issued before the expected notify | 38 | 41 | 44 | 47 | 50 ms |
|---|---|---|---|---|---|
| Hits of 40 | 7 | 11 | 7 | 10 | 5 |

- 200 reads, 40 hits.
- Receivers in the hits: both front 39, front left alone 1, back none.

## Run 3: Two reads, the second before the first is answered

As run 2, but two reads per beat: 50 and 42 ms before the expected notify. Both were written straight to the Bluetooth link, without write response and without waiting for a reply, under sequence numbers of their own.

| | Of 150 pairs |
|---|---|
| Write failed | 0 |
| Both answered | 150 |
| Answered in the order sent | 150 |
| First read a hit | 23 |
| Second read a hit | 29 |
| At least one a hit | 41 |
| Both a hit | 11 |

- Reply after 39 ms for the first read (35 to 47 ms for 10 to 90 %), 46 ms for the second (40 to 57 ms).
- Receivers in the hits: both front 51, front left alone 1.

## Run 4: Three and five reads per frame

Volleys of three and of five reads, 6 ms apart, centred 48 ms before the expected notify, taken in turn, 100 of each, one volley per two beats.

| | Three reads | Five reads |
|---|---|---|
| Volleys with at least one hit | 39 | 43 |
| Hits by read, earliest first | 6, 19, 28 | 3, 4, 18, 25, 13 |
| Read issued before the notify | 54, 48, 42 ms | 60, 54, 48, 42, 36 ms |
| Writes that failed | 4 | 11 |
| Volleys fully answered | 96 | 93 |
| Replies in the order sent | 100 | 100 |

- Receivers in the hits: both front 113, front left alone 3.
- 453 notifies in 82.6 s from 411 send commands. 44 of the notifies came 40 to 60 ms after the one before.

## Run 5: Three reads on every beat

As run 4 with three reads, but one volley on every beat, and the beat ignored every notify more than 25 ms off it. The first 20 notifies gave the beat; 2 of them were left out as off it. Three centres, taken in turn.

| Volley centred before the notify | 36 ms | 42 ms | 48 ms |
|---|---|---|---|
| Reads issued at | 42, 36, 30 | 48, 42, 36 | 54, 48, 42 |
| Hits by read | 8, 0, 0 | 10, 11, 0 | 1, 11, 17 |
| Volleys with at least one hit, of 60 | 8 | 18 | 21 |

- 180 volleys in 35.9 s. 174 fully answered. 6 of 540 writes failed with "GATT operation already in progress".
- Notifies used for the beat 179, ignored 7.
- Receivers in the hits: both front 56, front left alone 2.
- The arrival times of green's 948 replies and notifies in this run lie on a grid of 15.00 ms.

## Run 6: Two send commands per cycle

Blue got two send commands per 200 ms cycle, channel 1 and then channel 2 after the first was acknowledged, both at strength 8. The M5 recorded the frames (`capture.run(14, 500000)`, decoded with `decode_capture.py`).

- 125 frames in 21.2 s: 97 on channel 2, 28 on channel 1. A frame lasted 7.3 to 7.7 ms.
- First 15 s: one frame per 200 ms, always channel 2.
- After that: channel 1, then channel 2 starting 25 ms later, then 175 ms to the next channel 1. 18 such pairs, always in the order of the commands. Channel 1 to channel 1: 200.43 ms (24 intervals).
- Green meanwhile listened 9 s each with a channel mask. Channel 1 only: 1 notify. Channel 2 only: 45 notifies. Both: 37 on channel 1, 16 on channel 2.

## Run 7: Two send commands timed to the beat

The page timed blue's two commands to blue's beat. The beat was taken as the notify's arrival minus 30 ms. The first command went out 60 ms before it, the second at one of four moments, each with its own channel pair, 40 cycles each. The M5 recorded.

| Second command issued, relative to the beat taken | Both frames | First only | Second only |
|---|---|---|---|
| 10 ms before (channels 1, 2) | 23 | 13 | 19 |
| at it (3, 4) | 0 | 0 | 40 |
| 10 ms after (5, 6) | 0 | 0 | 35 |
| 20 ms after (7, 0) | 0 | 39 | 1 |

- Where both frames went out they started 25.0 to 25.1 ms apart.
- Of green's notifies, 69 were within 25 ms of the beat it followed and 134 were not.

## Readings of the numbers (not measurements)

- **A Bolt sends on its own clock.** A send command does not start a frame; it sets what goes out at the next sending moment. This reading rests on run 1 (the spread from command to notify, the period) and run 6 (frames 200.43 ms apart whatever the commands did).
- **Why a timed read works.** The notify tells when the last frame was, the period tells when the next one will be.
- **The second notify.** The 44 notifies that came 40 to 60 ms after another in run 4 are taken to be a second notify for the same frame, delivered when the listen was armed again. Run 5 left such notifies out of the beat.
- **A ceiling.** If commands reach green only every 15 ms (run 5) and a frame lasts 7.5 ms (run 6), about half the frames hold no moment at which a read can be carried out. Best measured: 43 %.
- **Two sending moments per beat.** Run 6 and 7 fit a Bolt that can send twice per beat, 25 ms apart, and sends the latest command it holds at each moment. With both commands in before the first moment, the later one replaces the earlier. This is not tested further.
- **Run 7's offsets are not exact.** A lone frame can go out at either moment, so its notify arrives 25 ms earlier or later, and the beat taken from the notifies moved with it.

## Code

- `packages/core/src/experiments/infrared-timing.ts`: `trackBeat` (the beat from the notifies), `volleyReader` (reads that do not wait for each other), `timedReads` (run 5 as a function). Written from the page scripts after the runs; not yet run in this form.
- `beacon-infrared/decode_capture.py`: channels and spacing of the frames the M5 recorded.
- The page scripts of runs 1, 6 and 7 were not kept. The setup lines above hold their settings.

## Open

- One distance, 80 cm, facing, standing still. Not measured while green rolls or turns.
- The period is blue's. Green's own beat as a sender is not measured.
- More than five reads at once, and commands other than the read sent this way.
- Whether a Bolt can be made to send two frames on every beat from the page. Run 7 reached 23 of 55 beats at its best setting.
- Useful reads per second over distance, 20 cm to 4 m: an approach run and a run passing the sender at 1 m are planned.
