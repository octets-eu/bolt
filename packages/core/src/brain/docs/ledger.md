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
