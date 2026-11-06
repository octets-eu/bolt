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
