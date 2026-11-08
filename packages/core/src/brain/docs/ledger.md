# Ledger

One row per seek run, appended by `brain/seek.mjs`. Distance centre to centre by the camera (each Bolt lit against a dark frame, the partition's ends laying the frame on the plan, about 0.28 cm per pixel). Time from the brain's first step, its first motion, to the shared collision. Goal: under 30 s per metre.

| when (UTC) | seeker | sender | start cm | measured | result | s | goal s | met | end cm | senses |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-11-06T16:05 | SB-9129 | SB-11DF | 107.5 | camera, lit blobs | time | 48.3 | 32.3 | no | 130.2 | 94 frames, 0/466 reads named |
| 2026-11-06T16:08 | SB-9129 | SB-11DF | 129.9 | camera, lit blobs | runaway | 15.1 | 39 | no | 106.5 | 61 frames, 3/138 reads named |
| 2026-11-06T16:10 | SB-9129 | SB-11DF | 106 | camera, lit blobs | found | 14.7 | 31.8 | yes | 6.7 | 58 frames, 5/192 reads named |
| 2026-11-06T16:12 | SB-9129 | SB-11DF | 103.5 | camera, lit blobs | runaway | 32.1 | 31.1 | no | 85.4 | 112 frames, 7/435 reads named |
| 2026-11-06T16:16 | SB-9129 | SB-11DF | 101 | camera, lit blobs | found | 15.8 | 30.3 | yes | 6.5 | 57 frames, 2/192 reads named |
| 2026-11-06T16:19 | SB-9129 | SB-11DF | 109.5 | camera, lit blobs | time | 49.2 | 32.9 | no | 18.5 | 109 frames, 9/678 reads named |
| 2026-11-06T16:20 | SB-9129 | SB-11DF | 18.6 | camera, lit blobs | runaway | 10.7 | 5.6 | no | 61.9 | 48 frames, 3/176 reads named |
| 2026-11-06T16:26 | SB-9129 | SB-11DF | 108 | camera, lit blobs | runaway | 10.8 | 32.4 | no | 74.2 | 41 frames, 0/128 reads named |
| 2026-11-06T16:33 | SB-9129 | SB-11DF | 75.1 | camera, lit blobs | time, seeker lost | 33.7 | 22.5 | no | not seen | 88 frames, 5/316 reads named; seeker ended hidden near the chest, about (343, 290) by a faint light, row written by hand |

Notes on the rows: the 16:20 row started 18.6 cm apart by mistake (no reset after the run before) and is not a seek. Runs before 16:26 had no gradient cue; before 16:33 the roll went out between the corner reads and their replies.
| 2026-11-06T17:00 | SB-9129 | SB-11DF | 99 | camera, lit blobs | time | 44.5 | 29.7 | no | 142 | 87 frames, 14/420 reads named |
| 2026-11-06T17:05 | SB-9129 | SB-11DF | 94 | camera, lit blobs | time | 42.2 | 28.2 | no | 129 | 132 frames, 8/388 reads named |
| 2026-11-06T17:09 | SB-9129 | SB-11DF | 96 | camera, lit blobs | runaway | 32.4 | 28.8 | no | 75.8 | 93 frames, 13/765 reads named |
| 2026-11-06T17:12 | SB-9129 | SB-11DF | 98.8 | camera, lit blobs | found | 37.3 | 29.6 | no | 7 | 94 frames, 21/845 reads named |
| 2026-11-06T17:14 | SB-9129 | SB-11DF | 104.7 | camera, lit blobs | time | 47 | 31.4 | no | 25.4 | 176 frames, 34/1085 reads named |
| 2026-11-06T17:17 | SB-9129 | SB-11DF | 94.6 | camera, lit blobs | runaway | 14.8 | 28.4 | no | 194.4 | 54 frames, 4/275 reads named |
| 2026-11-06T17:22 | SB-9129 | SB-11DF | 94.5 | camera, lit blobs | runaway | 39.7 | 28.4 | no | 118.4 | 134 frames, 18/890 reads named |
| 2026-11-06T17:26 | SB-9129 | SB-11DF | 96.9 | camera, lit blobs | fence | 19.3 | 29.1 | no | 52.3 | 74 frames, 13/410 reads named |
| 2026-11-06T17:28 | SB-9129 | SB-11DF | 98.1 | camera, lit blobs | fence | 10.6 | 29.4 | no | 175.8 | 31 frames, 1/215 reads named |
| 2026-11-06T17:31 | SB-9129 | SB-11DF | 95.3 | camera, lit blobs | time | 42.8 | 28.6 | no | 101.2 | 144 frames, 27/985 reads named |
| 2026-11-06T17:33 | SB-9129 | SB-11DF | 100.1 | camera, lit blobs | found | 12.2 | 30 | yes | 6.8 | 49 frames, 6/240 reads named |
| 2026-11-06T17:36 | SB-9129 | SB-11DF | 98.9 | camera, lit blobs | found | 41.4 | 29.7 | no | 7 | 127 frames, 26/970 reads named |
| 2026-11-06T17:39 | SB-9129 | SB-11DF | 100.2 | camera, lit blobs | fence | 8.7 | 30.1 | no | 59.7 | 28 frames, 1/145 reads named |
| 2026-11-06T17:42 | SB-9129 | SB-11DF | 99.1 | camera, lit blobs | fence | 16.6 | 29.7 | no | 84.5 | 64 frames, 6/340 reads named |
| 2026-11-06T17:46 | SB-9129 | SB-11DF | 103.4 | camera, lit blobs | time | 46.5 | 31 | no | 31.3 | 192 frames, 24/1085 reads named |
| 2026-11-06T17:49 | SB-9129 | SB-11DF | 98.9 | camera, lit blobs | found | 26.6 | 29.7 | yes | 6.5 | 96 frames, 20/610 reads named |
| 2026-11-06T17:51 | SB-9129 | SB-11DF | 105.5 | camera, lit blobs | time | 47.4 | 31.6 | no | 7.3 | 186 frames, 36/1115 reads named |
| 2026-11-06T17:54 | SB-9129 | SB-11DF | 103.3 | camera, lit blobs | time | 46.4 | 31 | no | 49.3 | 191 frames, 27/1085 reads named |
| 2026-11-06T17:57 | SB-9129 | SB-11DF | 103.3 | camera, lit blobs | found | 25.7 | 31 | yes | 33.9 | 92 frames, 8/351 reads named |
| 2026-11-06T18:00 | SB-9129 | SB-11DF | 105 | camera, lit blobs | time | 47.1 | 31.5 | no | 38.9 | 177 frames, 17/657 reads named |
| 2026-11-06T18:02 | SB-9129 | SB-11DF | 40.7 | camera, lit blobs | time | 19.9 | 12.2 | no | 15.4 | 89 frames, 3/270 reads named  VOID: placement had failed, the seeker was stuck against the right partition end 40 cm away; not a seek |
| 2026-11-06T18:05 | SB-9129 | SB-11DF | 106.6 | camera, lit blobs | found | 40 | 32 | no | 5.9 | 161 frames, 15/549 reads named |
| 2026-11-06T18:07 | SB-9129 | SB-11DF | 106.4 | camera, lit blobs | found | 20.9 | 31.9 | yes | 7.1 | 73 frames, 7/261 reads named |
| 2026-11-06T18:10 | SB-9129 | SB-11DF | 98.9 | camera, lit blobs | found | 23.7 | 29.7 | yes | 6.6 | 93 frames, 10/309 reads named |
| 2026-11-06T18:12 | SB-9129 | SB-11DF | 110.2 | camera, lit blobs | fence | 8.3 | 33.1 | no | 139.2 | 34 frames, 1/90 reads named |
| 2026-11-06T18:15 | SB-9129 | SB-11DF | 101.3 | camera, lit blobs | time | 45.5 | 30.4 | no | 36.9 | 161 frames, 21/651 reads named |
| 2026-11-06T18:17 | SB-9129 | SB-11DF | 104.5 | camera, lit blobs | time | 46.9 | 31.3 | no | 27.2 | 156 frames, 17/666 reads named |
| 2026-11-06T18:20 | SB-9129 | SB-11DF | 95.3 | camera, lit blobs | found | 28.9 | 28.6 | no | 6.7 | 101 frames, 7/402 reads named |
| 2026-11-06T18:22 | SB-9129 | SB-11DF | 94.9 | camera, lit blobs | time | 42.6 | 28.5 | no | 41 | 155 frames, 13/603 reads named |
| 2026-11-06T18:25 | SB-9129 | SB-11DF moving | 97.9 | camera, lit blobs | stalled | 12.3 | 29.4 | no | 137.8 | the seeker's motion stream stopped at 12.3 s and it rolled on into the cabinet at (266, 476); the stop hung and the process was killed (watchdog and capped stop added after); row written by hand |
| 2026-11-06T18:30 | SB-9129 | SB-11DF moving | 98.1 | camera, lit blobs | fence | 28 | 29.4 | no | 146.3 | 75 frames, 1/375 reads named |
| 2026-11-06T18:35 | SB-9129 | SB-11DF | 108.2 | camera, lit blobs | time | 48.5 | 32.5 | no | 107 | 161 frames, 13/699 reads named |
| 2026-11-06T18:38 | SB-9129 | SB-11DF | 101 | camera, lit blobs | found | 35.8 | 30.3 | no | 6.3 | 116 frames, 7/480 reads named |
| 2026-11-06T18:41 | SB-9129 | SB-11DF | 107.1 | camera, lit blobs | time | 48.1 | 32.1 | no | 74.6 | 187 frames, 23/681 reads named; tag gap 17178 ms on the clocks, 15402 arriving |
| 2026-11-06T18:44 | SB-9129 | SB-11DF | 104.9 | camera, lit blobs | found | 26.5 | 31.5 | yes | 6.1 | 89 frames, 10/351 reads named; tag gap 608 ms |
| 2026-11-06T18:46 | SB-9129 | SB-11DF | 105.1 | camera, lit blobs | found | 28.5 | 31.5 | yes | 6.3 | 124 frames, 6/384 reads named; tag gap 5 ms |
| 2026-11-06T18:47 | SB-9129 | SB-11DF | 6.3 | camera, lit blobs | found | 10.2 | 1.9 | no | 6.6 | 45 frames, 7/120 reads named; tag gap 49 ms  VOID: placement had failed, the seeker started next to the sender; not a seek |
| 2026-11-06T18:48 | SB-9129 | SB-11DF | 6.5 | camera, lit blobs | found | 4.6 | 1.9 | no | 6.4 | 20 frames, 0/33 reads named; tag gap 24 ms  VOID: placement had failed, the seeker started next to the sender; not a seek |
| 2026-11-06T18:50 | SB-9129 | SB-11DF | 107.7 | camera, lit blobs | found | 46.8 | 32.3 | no | 7.9 | 180 frames, 24/642 reads named; tag gap 177 ms |
| 2026-11-06T18:53 | SB-9129 | SB-11DF | 105.6 | camera, lit blobs | found | 22 | 31.7 | yes | 6.6 | 86 frames, 8/282 reads named; tag gap 180 ms |
| 2026-11-06T18:56 | SB-9129 | SB-11DF | 100.6 | camera, lit blobs | found | 25.2 | 30.2 | yes | 58.8 | 70 frames, 7/327 reads named; tag gap 97 ms  end distance after the seeker rolled on during the stop (sender stopped first, fixed); camera track 23 cm and closing at 23.5 s, sender felt x 10 at 25.4 s |

Notes on the rows of 2026-11-06 from 17:02 (the second session of the day; report-2026-11-06-2.md): the brain changed between rows, the report lists what changed when. From 17:26 the trace holds the seeker's camera track; the fence stops a run when the track enters a no-go part. Rows marked VOID are not seeks. The configuration of the session's end is that of the rows from 18:20 on.
| 2026-11-07T10:12 | SB-9129 | SB-11DF | 105.1 | camera, lit blobs | found | 22.7 | 31.5 | yes | 5.4 | 71 frames, 16/231 reads named; tag gap 341 ms |
| 2026-11-07T10:15 | SB-9129 | SB-11DF | 101.5 | camera, lit blobs | found | 25.3 | 30.5 | yes | 39.9 | 82 frames, 16/240 reads named; tag gap 2980 ms |
| 2026-11-07T10:21 | SB-9129 | SB-11DF | 111.7 | camera, lit blobs | found | 36.2 | 33.5 | no | 7.2 | 130 frames, 20/408 reads named; tag gap 561 ms |
| 2026-11-07T10:28 | SB-9129 | SB-11DF | 110.5 | camera, lit blobs | time | 49.7 | 33.2 | no | 48.2 | 173 frames, 40/576 reads named; tag gap Infinity ms |
| 2026-11-07T10:30 | SB-9129 | SB-11DF | 106.6 | camera, lit blobs | found | 10.7 | 32 | yes | 5.7 | 43 frames, 5/141 reads named; tag gap 3354 ms |
| 2026-11-07T10:32 | SB-9129 | SB-11DF | 104.7 | camera, lit blobs | found | 20.1 | 31.4 | yes | 6.2 | 79 frames, 11/231 reads named; tag gap 12 ms |
| 2026-11-07T10:34 | SB-9129 | SB-11DF | 110.1 | camera, lit blobs | fence | 14.8 | 33 | no | 31.5 | 60 frames, 6/180 reads named; tag gap Infinity ms |
| 2026-11-07T10:38 | SB-9129 | SB-11DF | 96.7 | camera, lit blobs | found | 33 | 29 | no | 6.5 | 143 frames, 34/453 reads named; tag gap 233 ms |
| 2026-11-07T10:41 | SB-9129 | SB-11DF | 94.2 | camera, lit blobs | found | 10.1 | 28.3 | yes | 6.1 | 40 frames, 5/123 reads named; tag gap 6 ms |
| 2026-11-07T10:43 | SB-9129 | SB-11DF | 94.5 | camera, lit blobs | found | 13.8 | 28.3 | yes | 6.9 | 45 frames, 8/144 reads named; tag gap 7 ms |
| 2026-11-07T10:46 | SB-9129 | SB-11DF | 87.8 | camera, lit blobs | found | 36.7 | 26.3 | no | 7.2 | 91 frames, 13/327 reads named; tag gap 228 ms FALSE DISTANCE: the camera took a light at (151.7, 431.9) for the sender, which stood at (253, 339) before and after; the true start was about 101 cm, goal 30.3 s, still late |
| 2026-11-07T10:48 | SB-9129 | SB-11DF | 99.1 | camera, lit blobs | found | 21.2 | 29.7 | yes | 6.7 | 85 frames, 17/285 reads named; tag gap 22 ms |
| 2026-11-07T10:50 | SB-9129 | SB-11DF | 97.9 | camera, lit blobs | fence | 18.3 | 29.4 | no | 54.6 | 41 frames, 6/153 reads named; tag gap Infinity ms |
| 2026-11-07T10:52 | SB-9129 | SB-11DF | 99.4 | camera, lit blobs | found | 19.9 | 29.8 | yes | 7.4 | 74 frames, 13/255 reads named; tag gap 7 ms |
| 2026-11-07T10:54 | SB-9129 | SB-11DF moving | 95.2 | camera, lit blobs | found | 25.3 | 28.6 | yes | 82.2 | 87 frames, 11/321 reads named; tag gap 2456 ms FALSE FIND, VOID: the camera track shows the seeker standing 80 cm off at (334, 334) from 22 s on; the tag paired the seeker's own report (y 16) with the rolling sender's at a corner of its square (y 33) |

Notes on the rows of 2026-11-07 (report-2026-11-07.md): the sender sends the ladder through utils/ladder.mjs and the observation keeps each channel's timing from 10:12 on; the stepped scan and the axis listen from 10:15; the near weave from 10:30; the miss gated by self.still from 10:41. Sender at (218, 297) in the doorway until 10:34, at (253, 339) from 10:38. The `--move` sender rolls a slow circle from 11:00, a square before.
| 2026-11-07T11:00 | SB-9129 | SB-11DF moving | 100.6 | camera, lit blobs | time | 45.2 | 30.2 | no | 84.9 | 132 frames, 23/483 reads named; tag gap 24699 ms |
| 2026-11-08T18:03 | SB-9129 | SB-11DF | 122 | the sheet: 1.2 m south of the starts | found | 23.5 | 36.6 | yes | 10 | 70 frames, 8/237 reads named; the ring plus distance layer (experiments/replay-ringdist.mjs) on the 36 ring, the browser's seek; the user: extra good, the collision happened, no extra legs |
