---
title: Infrared in an 80 cm triangle
purpose: The measurements of 2026-10-03 for the Communication page, setup and numbers only
type: record
measured: 2026-10-03, SB-11DF (blue), SB-9129 (green), M5 beacon
status: kept as measured; not yet repeated
tags: [bolt, infrared, record]
---

# Infrared in an 80 cm triangle

**Purpose.** Raw results for the target "two Bolts and a beacon arrange
themselves in a triangle". Setup and numbers. Readings of the numbers are
marked as such.

## Setup

- Two Bolts and the M5 beacon on a hard floor, in a triangle with 80 cm sides and 60° angles, laid out with a tape measure. Corrected by a few cm before run 5.
- Channels: green 1, blue 2, beacon 3 (run 4: the beacon used channels 0 to 7, one per duty level).
- A Bolt sends with the "send infrared message" command, same strength on all four emitters, one frame per 200 ms.
- The beacon sends through `beacon.frame(channel, duty)`: 38 kHz carrier, strength set by the duty in percent. It has one LED.
- A listening Bolt arms "listen" again after every notify. It polls "infrared readings" (0x22) 120 ms after each notify.
- Headings are in the listening Bolt's own frame. Receivers in 0x22: front left, front right, back right, back left.

## Run 1: Bolt to Bolt, full turn in 30° steps, 3 s per heading

Notifies per heading.

**Green sends at strength 4, blue listens:**

| Heading | 356 | 32 | 54 | 91 | 117 | 147 | 181 | 205 | 238 | 270 | 295 | 329 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Notifies | 13 | 12 | 12 | 12 | 0 | 0 | 8 | 12 | 13 | 9 | 0 | 0 |

0x22: 2 readings in 72 polls: back left at 205, back right at 238. Blue turned to 42°. Seen by eye: it pointed at green.

**Blue sends at strength 4, green listens:**

| Heading | 0 | 29 | 63 | 92 | 118 | 151 | 181 | 212 | 237 | 272 | 298 | 330 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Notifies | 6 | 5 | 3 | 13 | 13 | 13 | 1 | 11 | 11 | 10 | 11 | 11 |

0x22: no reading in 89 polls.

**Blue sends at strength 2, green listens:**

| Heading | 332 | 0 | 33 | 62 | 92 | 125 | 151 | 182 | 213 | 240 | 273 | 302 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Notifies | 11 | 0 | 0 | 9 | 11 | 11 | 11 | 0 | 2 | 12 | 11 | 9 |

0x22: no reading in 58 polls. The script then turned green to 289°. Seen by eye: both Bolts pointed at each other, at most 2° off.

## Run 2: reach of the beacon

- Beacon sends channel 3 at 33 % duty for 16 s, both Bolts listen for 12 s without turning: blue 34 notifies, green 37. 0x22: blue front right once; green all four once, three once.
- Bolts send at strength 4 for 3 s each, the beacon captures: 15 of 15 frames from green decoded as channel 1, 12 of 12 from blue as channel 2.

## Run 3: strength ladder, Bolt to Bolt

3 s per strength. Heard / sent. "Facing": the listener points at the sender. "Side-on": turned 90°.

| Strength | green → blue, facing | green → blue, side-on | blue → green, facing | blue → green, side-on |
|---|---|---|---|---|
| 1 | 0/15 | 0/10 | 0/5 | 0/2 |
| 2 | 9/11 | 0/15 | 7/8 | 0/5 |
| 3 | 12/12 | 0/15 | 9/10 | 0/5 |
| 4 | 9/9 | 0/10 | 8/8 | 0/7 |
| 6 | 11/11 | 0/15 | 10/10 | 4/5 |
| 8 | 12/12 | 1/15 | 9/9 | 6/6 |
| 12 | 7/7 | 6/7 | 9/9 | 6/6 |
| 16 | 12/12 | 13/13 | 8/8 | 6/6 |
| 24 | 7/7 | 12/12 | 8/8 | 5/5 |
| 32 | 12/12 | 7/7 | 7/7 | 6/6 |
| 64 | 8/8 | 8/8 | 7/7 | 4/4 |

The number of frames sent in 3 s varies because the page was stalling during this run (its log display, fixed afterwards).

## Run 4: duty ladder of the beacon, full turn in 30° steps, 5.6 s per heading

The beacon cycled through eight duty levels, one frame every 200 ms, 63 cycles in 100.9 s. About 3.5 frames per level were sent per heading. Frames heard per heading.

**Blue:**

| Duty | 0 | 32 | 61 | 86 | 121 | 146 | 176 | 212 | 236 | 272 | 296 | 330 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 % | 1 | 1 | 4 | 4 | 0 | 0 | 0 | 5 | 2 | 2 | 0 | 0 |
| 2 % | 5 | 4 | 3 | 4 | 0 | 0 | 1 | 4 | 4 | 4 | 0 | 0 |
| 3 % | 5 | 3 | 4 | 3 | 0 | 0 | 2 | 5 | 4 | 4 | 0 | 0 |
| 5 % | 4 | 4 | 3 | 3 | 0 | 0 | 3 | 4 | 4 | 4 | 0 | 0 |
| 8 % | 4 | 4 | 3 | 3 | 0 | 0 | 3 | 3 | 3 | 4 | 0 | 0 |
| 12 % | 4 | 4 | 4 | 3 | 1 | 0 | 4 | 3 | 3 | 4 | 1 | 3 |
| 20 % | 3 | 4 | 4 | 4 | 2 | 0 | 4 | 3 | 3 | 3 | 3 | 3 |
| 33 % | 3 | 3 | 4 | 4 | 5 | 1 | 5 | 4 | 5 | 4 | 3 | 3 |

0x22: 4 readings in 235 polls. At 212: back left (1 %). At 236: back pair (5 %), front right + back pair (33 %), back pair (3 %).

**Green:**

| Duty | 0 | 29 | 63 | 87 | 122 | 147 | 181 | 206 | 241 | 272 | 299 | 331 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 % | 3 | 0 | 4 | 4 | 4 | 5 | 3 | 0 | 3 | 4 | 4 | 3 |
| 2 % | 4 | 0 | 4 | 4 | 5 | 4 | 4 | 0 | 3 | 2 | 4 | 4 |
| 3 % | 4 | 0 | 4 | 4 | 5 | 5 | 4 | 0 | 1 | 1 | 5 | 4 |
| 5 % | 4 | 1 | 3 | 3 | 4 | 4 | 4 | 2 | 2 | 2 | 3 | 4 |
| 8 % | 4 | 4 | 4 | 3 | 3 | 4 | 4 | 5 | 5 | 1 | 3 | 5 |
| 12 % | 4 | 6 | 3 | 3 | 3 | 2 | 6 | 4 | 3 | 3 | 3 | 3 |
| 20 % | 3 | 4 | 4 | 3 | 3 | 4 | 3 | 4 | 4 | 5 | 3 | 3 |
| 33 % | 3 | 3 | 4 | 5 | 3 | 3 | 3 | 3 | 4 | 4 | 5 | 3 |

0x22: 7 readings in 308 polls. At 87: back left (1 %), front right + back pair (20 %), all four (33 %). At 147: back pair (8 %), all but front right (33 %). At 206: right pair (12 %). At 272: front pair (20 %).

Afterwards blue was turned to 44° and green to 298°. Seen by eye: both pointed at the beacon, at most 5° off.

## Run 5: two senders at once, full turn in 15° steps, 2.5 s per heading

The beacon sent channel 3 at 3 % (1075 frames in 215 s). The other Bolt sent its channel at strength 4. Notifies per heading.

**Blue listens:**

| Heading | 53 | 68 | 84 | 100 | 115 | 128 | 143 | 162 | 171 | 194 | 201 | 218 | 238 | 247 | 267 | 278 | 295 | 307 | 325 | 340 | 352 | 9 | 23 | 41 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Green | 8 | 0 | 0 | 0 | 0 | 13 | 12 | 12 | 13 | 12 | 8 | 8 | 0 | 0 | 0 | 0 | 10 | 12 | 9 | 12 | 13 | 10 | 12 | 13 |
| Beacon | 9 | 13 | 13 | 13 | 13 | 0 | 0 | 0 | 0 | 9 | 10 | 10 | 14 | 14 | 14 | 13 | 0 | 0 | 0 | 0 | 10 | 11 | 9 | 5 |

0x22: 320 polls; 3 usable readings for green, 6 for the beacon.

**Green listens:**

| Heading | 300 | 319 | 330 | 347 | 3 | 16 | 35 | 48 | 62 | 81 | 90 | 110 | 122 | 140 | 152 | 165 | 185 | 196 | 211 | 224 | 245 | 255 | 271 | 289 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Blue | 14 | 12 | 10 | 8 | 11 | 7 | 9 | 10 | 11 | 1 | 0 | 2 | 12 | 10 | 8 | 11 | 8 | 9 | 11 | 12 | 7 | 8 | 0 | 4 |
| Beacon | 7 | 6 | 9 | 6 | 8 | 9 | 0 | 3 | 7 | 13 | 12 | 12 | 10 | 11 | 9 | 7 | 9 | 11 | 0 | 9 | 8 | 5 | 11 | 10 |

0x22: 341 polls; 4 usable readings for blue, 7 for the beacon.

## Readings of the numbers (not measurements)

- **Windows at 80 cm** (heard facing, not heard side-on): green → blue strength 3 to 6; blue → green 3 to 4; beacon → blue 2 to 8 %; beacon → green 1 to 3 %.
- **Direction from run 5**, computed two ways:

  | | Midway between the two deaf gaps | Mean weighted by notifies |
  |---|---|---|
  | Blue: green at | 354.1° | 351.2° |
  | Blue: beacon at | 54.1° | 62.9° |
  | Blue: angle between them | 60.0° | 71.7° |
  | Green: blue at | 2.6° | 357.7° |
  | Green: beacon at | 305.4° | 298.0° |
  | Green: angle between them | 57.2° | 59.7° |

  A deaf gap is a run of headings with at most a quarter of the highest count. The deaf-gap method was chosen after seeing both results, so run 5 does not prove it.
- The end of the line (front or back) was taken from the 0x22 readings in every case except blue → green in run 1, where there were none.

## Open

- Repeat run 5 with the deaf-gap method fixed in advance.
- 0x22 gave between 0 and 7 readings per sweep. A method that does not depend on it is missing.
- The same runs at other distances. So far only 80 cm.
- Senders were not turned toward the listener in run 5. Whether the sender's own heading matters is not measured.
