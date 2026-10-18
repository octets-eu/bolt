---
title: Command inventory of SB-9129
kind: facts
device: SB-9129
tags: [bolt, facts, protocol, commands]
created: 2026-09-19
updated: 2026-09-20
status: living
---

# What SB-9129 says it supports

Asked on 2026-09-19 with API/shell 0x05 (supported device IDs) and 0x06
(supported command IDs), per processor. Names from spherov2.py where the ID is
known; probes for the rest.

## Nordic, target 0x11

| DID | CIDs |
|---|---|
| 0x10 api/shell | 00 01 02 03 05 06 |
| 0x11 system info | 00 01 03 06 0e 10 13 1e 1f 20 21 26 2b 2c 2d 2e 30 31 33 34 37 38 |
| 0x12 | 02 26 27 |
| 0x13 power | 00 01 03 0b 0d 14 16 17 1b 1f 20 |
| 0x19 bluetooth | 00 02 03 04 05 |
| 0x1a user IO | 0e 1a 1b 1c 3c 3f |
| 0x1d | 06 08 0c 0d 0f |
| 0x1f | 11 12 13 14 15 27 31 33 34 |

## ST, target 0x12

| DID | CIDs |
|---|---|
| 0x10 api/shell | 00 01 02 03 04 05 06 |
| 0x11 system info | 00 01 03 13 1f 26 2b 2c 2d 2e 30 31 33 34 37 38 |
| 0x13 power | 0a 15 |
| 0x16 driving | 01 06 07 08 09 0c |
| 0x18 sensor | 00 01 09 0a 0b 0c 0d 0e 0f 11 13 17 22 25 27 28 29 2a 2b 2d 2e 30 32 33 34 |
| 0x19 bluetooth | 03 04 |
| 0x1a user IO | 2d 2e 2f 30 31 32 33 34 35 36 37 38 39 3a 3b 3d 3e 40 41 42 43 |
| 0x1d | 05 |
| 0x1f | 13 14 15 27 28 29 2a 2b 32 33 34 |

## Sensor device, the IDs not in any table

Probed with an empty payload, ball at rest and upright.

| CID | Answer | Reading |
|---|---|---|
| 0x09 | 4 bytes, constant across reads | unknown, 0x0a6ff2b1 |
| 0x0a | 4 floats | pitch, roll, roll again (unfiltered?), yaw: the fused IMU angles on demand |
| 0x0b | 3 floats | gyro x y z, deg/s, on demand |
| 0x0e | 1 byte, 1 | a flag |
| 0x2d | 1 byte, 50 | unknown |
| 0x2e | command is restricted | |

No magnetometer read. The only magnetometer output stays the north yaw
notification 0x26 after the calibration spin 0x25. Streamed gyro through the
extended mask 0x0c is confirmed, 12 more bytes per sample.
