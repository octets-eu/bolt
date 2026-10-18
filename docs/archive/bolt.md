---
title: Bolt fact book
kind: facts
subject: Sphero BOLT
device: SB-9129
tags: [bolt, facts, firmware, sensors, motion]
created: 2026-09-19
updated: 2026-09-20
status: living
aliases: [facts, bolt facts]
---

# Bolt fact book

Everything measured or verified about the Sphero BOLT itself. Facts about the
room, the mat, the ramp, the camera and the lighthouse belong in `rig.md`;
how to get connected belongs in `setup.md`.

Conventions:

- Every number carries the date, the Bolt and the ground it was measured on.
  Grounds: **mat** (yoga mat, high friction), **floor** (hard floor),
  **cushion**, **ramp** (cardboard to the charger).
- One fact per row or bullet. A corrected fact is edited in place, never
  appended below the old one; git keeps the history.
- Facts live here once. Other docs link, they do not repeat.
- Unless stated otherwise: SB-9129, September 2026.

## Identity and link

| Fact | Value | Source |
|---|---|---|
| Advertised name | `SB-` followed by four hex digits | 2026-09-16 |
| Primary service | `00010001-574f-4f20-5370-6865726f2121` | `packages/web-ble/src/gatt.ts` |
| API v2 characteristic | `00010002-…` in the same base | same |
| Initialize service, anti-DoS characteristic | `00020001-…`, `00020005-…` | same |
| Anti-DoS unlock | the string `usetheforce...band` written to the anti-DoS characteristic, before that every command is refused | same |
| Processors | Nordic, target `0x11`: shell, system info, power, bluetooth, user IO. ST, target `0x12`: driving, sensors, most of user IO | `commands.md`, 2026-09-19 |
| Command inventory | reported by the firmware per processor, see [[commands]] | 2026-09-19 |
| Reconnect | a paired Bolt reconnects on page load through `getDevices()` and `watchAdvertisements()`; it does not advertise while asleep on the charger | 2026-09-16 |
| Connection drops | when Chrome quits; the Bolt reconnects on the next page load | 2026-09-16 |

## Power and sleep

| Fact | Value | Measured |
|---|---|---|
| Power commands | deepSleep `0x00`, sleep `0x01`, wake `0x0d` | constants |
| Notifications | awake `0x11`, willSleep `0x19`, didSleep `0x1a`, all on Power `0x13` | constants, 2026-09-18 |
| Awake notification | sent about 100 ms after a wake that followed a real sleep, 92 ms on 2026-09-23; a Bolt that was already awake sends none | 2026-09-18 |
| Sleep to didSleep | about 2 s | 2026-09-18 |
| Sleep then wake round trip | about 2.6 s, proves the motor side will act | 2026-09-18 |
| Acks prove nothing | a sleeping Bolt acks `roll`, `stabilize` and every battery read with success | 2026-09-18 |
| Sleep wipes configuration | streaming mask, notification switches and LED colours are gone after sleep and wake | 2026-09-18 |
| Purple front and back LEDs | the firmware's "nobody set my colours" state, not a sleep indicator | 2026-09-18 |
| Wake from light sleep | `wake` reaches a Bolt in `sleep`; nothing reaches it in `deepSleep`, someone has to pick it up | plan, not re-measured |
| Onboard timer | none; there is no timed wake, the Mac holds the clock | design fact |
| Charger event | putting the ball in the cup by hand fires `charger` with state 2 within about 2 s; state 1 is not charging | 2026-09-17 |
| Duty cycle | roughly 2 h of driving against a multi-hour charge | estimate |

Still open: whether `sleep` releases motor holding torque (the chassis falling
to vertical while asleep).

## Motion

### Speeds and distances on the mat

| Speed | Result | Measured |
|---|---|---|
| 40 | does not move the ball | 2026-09-17, mat |
| 60 | crawls | 2026-09-17, mat |
| 70 | about 28 cm/s once rolling | 2026-09-17, mat |
| 70, 0.5 s from standstill | about 12 cm | 2026-09-17, mat |
| 70, 1.0 s from standstill | about 29 cm | 2026-09-17, mat |
| 70, 1.4 s from standstill | about 45 cm | 2026-09-17, mat |

- Rule of thumb for a move of `d` cm at speed 70: `t = d / 33 cm/s + 0.15 s`.
- Moves under 10 cm are not repeatable; plan 15 cm or more and correct after.
- Anything meant to move on the mat starts at 70.

### Slopes and edges

| Fact | Value | Measured |
|---|---|---|
| Start on the ramp | impossible from standstill, the drive spins on the cardboard; needs a run-up of 25 to 30 cm | 2026-09-17, ramp |
| Speed 90, run-up 24 cm | stalls near the top | 2026-09-17, ramp |
| Speed 100, run-up 25 cm | clears the ramp | 2026-09-17, ramp |
| Mat edge, 1 cm lip | stops the ball dead when approached slowly or at an angle; it hops the lip only with a run-up; from standstill against the lip it wedges at about 15 degrees pitch and needs a reversal first | 2026-09-17, mat |
| Odometry on a slope | the locator counts wheel travel: 30 cm advanced while the ball climbed 10, and it kept counting during a stall | 2026-09-17, ramp |
| Momentum | rolling into a speaker at speed 80 knocked it over | 2026-09-17 |

### Chassis mechanics

| Fact | Value | Measured |
|---|---|---|
| Actuated axes | wheel torque pitches the chassis, the differential yaws it, nothing acts about the front-back axis | 2026-09-18 |
| Righting | gravity brings the wheels down, but only on ground the shell can roll on; on a cushion the chassis lay on its side at 91 degrees tilt and stayed | 2026-09-18, cushion |
| A chassis on its side is not wedged | raw motor pulses, differential 200 for 200 ms, whirl it at about 1800 deg/s and it lands somewhere new | 2026-09-18, cushion |
| Righting by spins | spins bring the tilt up in steps, 41, 29, 18, 10, 5 degrees; straight pulses were worse and launch a free ball | 2026-09-18, cushion |
| Righting cost | about 0.9 s per pulse; `calibration.upright` is that search, with a `help` event when the budget of 20 pulses runs out | 2026-09-18 |
| Whirls corrupt yaw | 2000 deg/s is the gyro's edge; after four pulses north was 60 degrees off, later 180; a raw pulse voids north | 2026-09-18 |
| Stabilization off after a stop | the chassis swings for over 3 s | 2026-09-19, floor |
| Stabilization on after a stop | settles in about 0.5 s | 2026-09-19, floor |
| Stabilization holds heading and attitude | so it is engaged only once upright and north are known, and off while the ball is handled by hand | 2026-09-19 |
| Chassis swing after any move | about 1.3 s; the gyro says when it stops | 2026-09-19 |

### Drive limits

From `experiments.tiltStep` (steps from rest, then a brake), evaluated by
`Debug.tiltStep`; locator speed and pitch; 2 to 4 runs each.

| Fact | Value | Measured |
|---|---|---|
| Latency | 140 to 210 ms from a roll command to the first pitch or speed change; samples arrive every 57 to 60 ms | 2026-09-25, mat |
| Pitch while accelerating | plateau 55 to 62 degrees, reached in 300 to 365 ms, the same at speed 150 and 255 | 2026-09-25, mat |
| Speed at 255 from rest | 46 to 48 cm/s after 0.8 s, 71 to 78 after 1.2 s, still rising; about 70 to 80 cm/s2 on average | 2026-09-25, mat |
| After roll 0 | the speed rises for another 26 to 81 ms, then falls at 50 to 80 cm/s2: from about 50 cm/s 21 to 25 cm and 1.0 s to rest, from about 85 cm/s 44 to 46 cm and 1.3 s; pitch -37 to -54 | 2026-09-25/26, mat |
| Roll 0 is the hardest controlled brake | the firmware changes speed at about the same rate both ways; speed ramps from 255 to 0 over 200 to 800 ms stopped later (32 to 63 cm), the speed byte is not cm/s and a ramp above the actual speed keeps accelerating | 2026-09-26, mat |
| Reverse flag | drive_reverse, bit 0x01 of the drive flags (Sphero SDK); a backward target speed the firmware chases at full effort: at 40 as at 150 the chassis swings to -44 to -118 degrees and the locator reports 195 to 241 cm/s, the wheels' speed inside the shell, not the shell's | 2026-09-25/26, mat |
| Raw motor mode 3 | not documented; the SDKs list off 0, forward 1, reverse 2, and fall back to off for others | Sphero SDK docs |
| Hard floor, speed | faster than on the mat: at 255 62 to 67 cm/s after 0.8 s, 96 to 107 after 1.2 s, peaks 115 to 117 after roll 0; latency the same, 113 to 185 ms | 2026-09-26, floor |
| Hard floor, braking with roll 0 | 50 to 64 cm/s2, as on the mat, so the firmware sets the rate, not the ground; the faster ball needs more room: 46 to 52 cm from about 76 cm/s, 79 to 94 cm from about 116 cm/s | 2026-09-26, floor |
| Hard floor, locator against camera | 255 for 0.8 s: within 1 to 2 cm on 73 to 81 cm; 150 for 0.4 s: the locator counts 6 to 7 cm more on 18 to 34 cm, slip at the breakaway; camera by `MAT_POINTS`, itself 5 to 10 % long on the mat | 2026-09-26, floor |
| Locator scale at gentle speed | right on the mat: 56.9 cm by locator against about 57 to 60 on a newspaper spread | 2026-09-25, mat |

## Frames: heading and locator

| Fact | Value | Measured |
|---|---|---|
| Heading | 0 to 360 degrees, clockwise seen from above | 2026-09-17 |
| Heading 0 | whatever the firmware carries at connect; arbitrary, and not preserved across reconnects (180 degrees apart after one reload) | 2026-09-17 |
| Locator axes | fixed to the firmware's boot frame: y along boot heading 0, x along boot heading 90; a move on heading h shows as `(sin h, cos h)` times the distance when no yaw reset has happened | 2026-09-17 |
| Locator and yaw resets | `resetYaw` turns the heading frame and leaves the locator's axes where they were; the offset between them is the sum of the resets since boot | 2026-09-19 |
| Offsets seen in one day | 170, 90, 141, 139 degrees | 2026-09-19 |
| `resetLocator` | zeroes the position, does not realign the axes; the locator is also zeroed at every connect | 2026-09-17 |
| Locator offset learned from legs | every roll leg over 5 cm feeds `locatorOffset`, circular mean of the last 6 legs; one leg after connect is enough | 2026-09-19 |
| Precision after one leg | `rollToPoint` back to the origin landed within 0.1 cm | 2026-09-19, floor |
| Odometry | wheel travel, optimistic on slopes and during stalls; direction and rough distance only | 2026-09-17 |
| North as a heading | `calibrateNorth` no longer resets yaw; north is kept as `northHeading`, bearings convert through `navigation.headingFor` | 2026-09-19 |
| Heading measured in another connection | worthless, the frame changed | 2026-09-17 |

## Attitude, IMU

| Fact | Value | Measured |
|---|---|---|
| Streamed angles | pitch and roll are gravity referenced; yaw is relative to the boot heading and drifts | 2026-09-17 |
| On-demand reads | sensor `0x0a` returns four floats, pitch, roll, roll again, yaw; `0x0b` returns gyro x y z in deg/s | 2026-09-19 |
| Gyro streaming | extended mask `0x0c`, 12 more bytes per sample | 2026-09-18 |
| Tilt from the accelerometer | `atan2(hypot(ax, ay), az)`, direction `atan2(ay, ax)`, and `|a|` near 1 g means the reading is pure gravity | 2026-09-18 |
| Tilt at rest | 2 to 4 degrees on the floor, 5 to 8 on a cushion | 2026-09-19 |
| Tilt is only readable at rest | the chassis swings for about 1.3 s after any move | 2026-09-19 |
| Pitch on the flat | under 10 degrees | 2026-09-17, mat |
| Pitch climbing the ramp | 45 to 80 degrees; at the crest it drops back under 20; stalled means pitch stays high while the position stops changing | 2026-09-17, ramp |
| Pitch wedged against the mat lip | about 15 degrees | 2026-09-17, mat |
| Tilt during the north spin | climbs from 7 to 25 degrees; on the floor it comes back by gravity within 2 s and the yaw shake takes the rest; on a cushion it stays | 2026-09-19 |

## Magnetometer and north

| Fact | Value | Measured |
|---|---|---|
| Magnetometer read | none exists; the only output is the north yaw notification `0x26` after the calibration spin `0x25` | 2026-09-19 |
| The spin | the firmware turns the ball itself; 417 to 552 degrees of yaw swept on the floor | 2026-09-19, floor |
| Spin with a jammed chassis | the shell does not turn, 109 to 115 degrees swept, and the reported north is garbage; spins under 300 degrees are rejected | 2026-09-19 |
| Spin on a cushion | works once the chassis is upright, 421 and 495 degrees | 2026-09-19, cushion |
| Repeatability at one spot | three fixes in a row reported 111, then 1, then 359 degrees, the later two finding the ball already facing north | 2026-09-17, mat |
| Scatter at one spot | three full spins gave 44, 24, 51, then 357, 322, 54 degrees | 2026-09-19, floor |
| North estimate | circular mean of consecutive spins that agree within 10 degrees, up to 3 tries, with the spread kept in `calibration.northSpread` | 2026-09-19 |
| `calibrateNorth` turns to the reported angle | not by it; the old `rotate(angle)` was only right when the heading was 0 | 2026-09-17 |
| North across the mat | varies by over 100 degrees between spots 25 cm apart; that is the room, see `rig.md` | 2026-09-17, mat |

Still open: whether the scatter at one spot comes from the starting
orientation or from the spot.

## Light sensor

| Fact | Value | Measured |
|---|---|---|
| Read | command `0x30`, 4 bytes, a float in lux | 2026-09-17 |
| Poll rate with an empty queue | 22 samples/s (129 in 6 s) | 2026-09-17 |
| Dark room floor | 6.5 to 7.5 lux | 2026-09-17 |
| Torch at about 30 cm | +5.3 lux | 2026-09-17 |
| Torch at about 55 cm | +1.3 lux | 2026-09-17 |
| Torch at about 130 cm | +0.5 lux, blink still resolvable | 2026-09-17 |
| Falloff | roughly inverse square | 2026-09-17 |
| 1 Hz blink | a clean square wave, 6.5 lux off, 11.8 lux on, zero crossings give exactly 1.0 Hz | 2026-09-17, 30 cm |
| Directionality | lock-in amplitude over twelve headings at 55 cm and 1 Hz: 0.17 to 0.78 lux, a lobe about 120 degrees wide, best to worst 4.5 | 2026-09-17 |
| Mean brightness | does not follow the lobe; the brightest heading had one of the lowest amplitudes | 2026-09-17 |
| 2 Hz blink | 0.66 to 0.75 lux against 0.78 at 1 Hz, no measurable roll-off; controls at 1 and 4 Hz while the beacon ran at 2 Hz read 0.04 and 0.10 lux; a control at 0.37 Hz read 0.01 | 2026-09-17 |
| Aliasing limit | at 22 samples/s, 5 Hz leaves four samples per cycle | arithmetic |
| Position during a sweep | held to the centimetre while rotating in place | 2026-09-17 |
| Self-blinding | the sensor sits next to the matrix; blank the matrix during a light reading | design fact |

## LED matrix and lights

| Fact | Value | Measured |
|---|---|---|
| Marker level, evening | 12 of 255; brighter clipped to white on the camera, dimmer vanished, and near the camera even 12 clipped | 2026-09-17 |
| Marker level, daylight | 12 gives no classified pixels at all; 80 to 120 gives the most, green 86 and blue 65 to 115; above 180 the glow clips to white; the level is a property of the room light, not of the Bolt | 2026-09-20 |
| Colours on the camera at level 12, evening | green (161, 244, 251), red (247, 195, 214), blue (170, 222, 255), by differencing frames with the matrix off and on | 2026-09-17 |
| Colours on the camera at level 100, daylight | green (105, 178, 198), blue (102, 164, 201), red (160, 164, 187), same method; red renders pink-white and the classifier barely fires on it | 2026-09-20 |
| Clipping | is exposure, not pixel format or frame rate; an RGB stream would clip the same way | 2026-09-17 |
| Front and back LEDs after sleep | purple, see Power | 2026-09-18 |
| Matrix rotation and LED colours | written by the actuator layer, wiped by sleep | 2026-09-18 |

## Streamed sensors

The mask stream is push, it does not pass through the serial queue. Everything
polled costs one BLE round trip, gated on the previous ack.

| Signal | Units | Character |
|---|---|---|
| `angles.pitch`, `angles.roll` | deg | gravity referenced, fused, no drift |
| `angles.yaw` | deg | relative to boot heading, drifts |
| `locator.positionX/Y` | cm | dead reckoned, slips on soft ground |
| `locator.velocityX/Y` | cm/s | derived; near zero under torque means stuck |
| `accelerometer.x/y/z` | g | streamed since 2026-09-18 |
| `gyro.x/y/z` | deg/s | extended mask |
| `ambientLight` | lux | polled, `0x30` |

Events: `charger`, `collision`, `battery`, `willsleep`, `didsleep`, `awake`,
`compass` (north yaw), `infrared` (message channel).

## Collisions

| Fact | Value | Measured |
|---|---|---|
| Threshold 40 | fires on the ramp lip and on bumps of the ball's own body, and on wall bumps | 2026-09-17 |
| Threshold 100 (default) | never fired when rolling into a speaker at speed 80 | 2026-09-17 |
| Meaning | collisions are information, not a stop condition for a docking loop | 2026-09-17 |
| Detection | the firmware computes the power of the accelerometer signal on X (left, right) and Y (front, back) and reports when it exceeds a threshold; Z is not used | Sphero collision detection document |
| Command | sensor device 0x18, command 0x11: method (1 on, 0 off), thresholds, speed terms, dead time in 10 ms units. The threshold per axis is Xt + a speed term scaled by the ball's speed; the scaling is not documented. Typical thresholds 100 to 140, dead time about 100 (1 s) | Sphero API, spherov2 |
| Byte order | method, Xt, Xspd, Yt, Yspd, dead time, as `sensors.ts` sends it; spherov2 names them Xt, Yt, Xspd, Yspd, which does not match: at rest from 100 everywhere, byte 1 at 0 fired on axis X, byte 3 at 0 on axis Y, bytes 2 and 4 at 0 did nothing, any single byte at 20 did nothing | 2026-09-23 |
| A base threshold of 0 | contrary to the document it does not disable the axis: that axis fires every dead time, at rest too, with power 0; both base thresholds at 0 fired nothing | 2026-09-23 |
| Notification | command 0x12, 16 bytes: impact x, y, z as int16 over 4096 g, axis bitmask (1 X, 2 Y), power X and Y as uint16, speed, timestamp; 18 bytes on BOLT+ with a power Z | spherov2, `payloads.ts` |
| Power against threshold | the reported power is the power itself on the threshold's scale, not the excess: at threshold 100 the firing axis reported 135 to 179 in five charges, at 20 it reported 20 to 30 | Sphero API; 2026-09-23 |
| Threshold 20, speed terms 0 | silent at rest; a slow contact with the mat lip at command 40 gave 2 to 4 events at 20 to 30, free driving at 50 and 70 gave 2 events at 20 to 21 each, starting off included: a slow contact is not told from driving | 2026-09-23 |
| Bump at the lip at 70 from 15 cm | Y power 26 to 41 | 2026-09-23 |
| Example from the document | front wall at speed 106: axis Y, power X 80, Y 215 | Sphero collision detection document |

## Infrared

Researched 2026-09-19, see [[infrared-external-device]] for the capture plan.

| Fact | Value | Source |
|---|---|---|
| Hardware | four emitter and receiver pairs: front, left, right, back | Sphero |
| Channels | 0 to 7; a message is a channel number, the receiver reports the channel, not the sender | Sphero |
| Intensity | 1 to 64 per side, "proportional to proximity", 1 nearest | Sphero |
| Broadcast, follow, evade | take a far code and a near code; a channel serves one purpose at a time | Sphero |
| Range | up to 4 m, the far code meant for 1 to 3 m, the near code under 1 m | Sphero |
| Carrier | close enough to 38 kHz for a standard receiver module | Garrett Gross, 2018 |
| Encoding | Sphero's own, stable per channel (IRremote hashes E95897BF and CC1C9F5A for channels 6 and 7); bit layout unpublished | same |
| Commands on SB-9129 | device `0x18`, target `0x12`: `0x22` readings, `0x27` broadcast, `0x28` follow, `0x29` stop broadcast, `0x2a` send, `0x2b` listen, `0x2c` message notify, `0x32` stop follow, `0x33` evade, `0x34` stop evade | 2026-09-19 |
| Not supported | `0x3e` and `0x3f`, the RVR variants spherov2 wrongly uses for the Bolt | 2026-09-19 |

## Bolt+

Unverified here, from the community.

| Fact | Value |
|---|---|
| Advertised name | `BP-` prefix |
| Framing | same BLE framing as the Bolt, all commands on target `0x11` (single SoC) |
| IR and LCD | unverified; the UNSW spherov2 fork lists IR as not working |

## Not yet measured

- Whether `sleep` releases motor holding torque.
- Dock capture radius and time to dock from the light peak.
- Wall-clock cost of one full light sweep.
- Whether IR intensity changes only the LED current or also the frame.
- Pitch and roll distributions while rolling, to set a trim threshold from
  data instead of by guess.
