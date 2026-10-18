---
title: Bolt reference
purpose: How a Sphero BOLT works, as far as this project uses it, independent of floor and room
checked: 6c294fd
---

# Bolt reference

How a Bolt works: the link, the commands, what it forgets in sleep, how it moves, what it senses, how it talks by infrared. Everything here is what the code relies on, with the code as ground truth: `packages/core/src`, mainly `protocol/constants.ts`, `sensors/`, `actuators/`, `communication/`, `behavior/beat.ts` and `lifecycle/`. Numbers come from measurements on the two Bolts of this project, SB-9129 and SB-11DF. Anything that depends on the floor, speeds, braking, slip, is not here on purpose.

## 1 The ball

A Bolt is a ball of about 7 cm with a two-wheeled carriage inside. The carriage drives against the shell; the shell rolls. The electronics sit in the carriage and keep upright by their own weight. Two processors: the Nordic runs Bluetooth and power, the ST runs the motors, the sensors and the lights.

It has a motor pair with a control loop, an IMU with gyro and accelerometer, a dead-reckoning locator, an 8 by 8 colour matrix on top with two single LEDs front and back, four infrared emitter and receiver pairs, a light sensor next to the matrix, a magnetometer, and a battery charged by induction in its cradle. There is no clock that wakes it; the computer holds the time.

## 2 The link

Bluetooth Low Energy. The Bolt advertises as `SB-` plus four hex digits. It does not advertise while asleep in the cradle.

| Name | UUID |
|---|---|
| Sphero service | `00010001-574f-4f20-5370-6865726f2121` |
| API v2 characteristic, all commands and answers | `00010002-574f-4f20-5370-6865726f2121` |
| Initialize service | `00020001-574f-4f20-5370-6865726f2121` |
| Anti-DoS characteristic, the unlock | `00020005-574f-4f20-5370-6865726f2121` |

Connecting: open the GATT server, switch notifications on for the API characteristic, write the text `usetheforce...band` to the anti-DoS characteristic. Until that text is written the firmware refuses every command. Writes are at most 20 bytes; a longer packet goes in pieces and the Bolt joins them by the start and end bytes.

**A packet** on the wire:

| Part | Bytes | Meaning |
|---|---|---|
| start | 1 | `8D` |
| flags | 1 | see below |
| target | 0 or 1 | the processor, only when the flags say so |
| device | 1 | the part of the firmware, e.g. `16` driving |
| command | 1 | the command's number inside the device |
| sequence | 1 | a running number 0 to 254; notifications carry 255 |
| data | any | the parameters |
| checksum | 1 | all bytes from flags to data summed, inverted, low 8 bits |
| end | 1 | `D8` |

Flags, one bit each: `01` this is a response, `02` please answer, `04` answer only on error, `08` reset the inactivity timer, `10` a target byte follows, `20` a source byte follows. Targets: `11` Nordic, `12` ST. The bytes `8D`, `AB`, `D8` inside a packet are escaped as `AB 05`, `AB 23`, `AB 50`.

A **response** has the same layout with the response bit set and one more byte after the sequence, the error code, and the sequence number of the command it answers. A **notification** is something the Bolt sends by itself, with sequence 255 and no error code.

Error codes: 0 success, 1 bad device, 2 bad command, 3 not implemented, 4 restricted, 5 bad data length, 6 command failed, 7 bad parameter, 8 busy, 9 bad target, 10 target unavailable. An unknown command is answered with bad command after about 40 ms.

**Timing.** One command in flight at a time is the rule this project drives by; a second command is written when the first is answered. An ack takes 26 ms at the least, 30 to 36 ms as the median, under 60 ms in nine of ten cases, so a Bolt takes about 30 commands a second. Nothing answers within 3 s: the command is given up. A failed write never goes through on a retry. Commands reach the Bolt on a 15 ms grid.

The one exception to one in flight: reads that must land milliseconds apart are written at once, each under its own sequence number, and the Bolt answers them in order.

## 3 Commands

| Device | No. | Command | Target |
|---|---|---|---|
| API processor `10` | `00` | ping | none |
| Power `13` | `00` | deep sleep | none |
| | `01` | sleep | none |
| | `03` | get battery voltage | Nordic |
| | `0D` | wake | none |
| | `17` | get battery state | Nordic |
| | `1B` | battery state notify on/off | Nordic |
| | `1F` | get charger state | Nordic |
| | `20` | charger state notify on/off | Nordic |
| Driving `16` | `01` | raw motors | ST |
| | `06` | reset yaw | ST |
| | `07` | drive with heading | ST |
| | `0C` | stabilization | ST |
| Sensor `18` | `00` | set streaming mask | ST |
| | `0C` | set extended streaming mask | ST |
| | `0F` | gyro max notify on/off | ST |
| | `11` | configure collision detection | ST |
| | `13` | reset locator | ST |
| | `22` | get infrared readings | ST |
| | `25` | calibrate to north | ST |
| | `2A` | send infrared message | ST |
| | `2B` | listen for infrared messages | ST |
| | `30` | get ambient light | ST |
| User IO `1A` | `1C` | set all LEDs | none |
| | `2D` `2F` `38` `3E` `3D` `42` | matrix pixel, colour, clear, fill, line, character | ST |
| | `30` `31` `34` `35` `43` | save frame, save animation, list frames, delete animations, play animation | ST |
| | `3A` | matrix rotation | ST |
| | `3B` | scroll text | ST |

The sensor device also knows `27` broadcast, `28` follow, `29` stop broadcast, `32` stop follow, `33` evade, `34` stop evade: the firmware's own infrared games, unused here. `3E` and `3F`, the RVR variants some libraries send, are not supported.

**Notifications:**

| Device, No. | Event | Carries | Switched on by |
|---|---|---|---|
| power `11` | awake | nothing | nothing |
| power `19` | will sleep | nothing | nothing |
| power `1A` | did sleep | nothing | nothing |
| power `1C` | battery | unknown, ok, low, critical | battery state notify |
| power `21` | charger | unknown, not charging, charging, charged | charger state notify |
| sensor `02` | stream | one sample | the streaming masks |
| sensor `10` | gyro max | raw bytes | gyro max notify |
| sensor `12` | collision | impact per axis, power, speed, time | configure collision |
| sensor `26` | compass | the yaw of north | calibrate to north |
| sensor `2C` | infrared | the channel heard | listen for infrared messages |
| user IO `3C` | scroll done | nothing | a scroll text command |
| user IO `3F` | animation done | nothing | a play animation command |

## 4 Power and sleep

`sleep` is light sleep; `wake` reaches it. `deep sleep` is off; only the cradle or a hand wakes it. Sleep to the did-sleep notification takes about 2 s. Wake to the awake notification takes 130 to 145 ms; a Bolt that is already awake sends no awake. The Nordic answers while the Bolt sleeps, so ping and the battery reads are acked asleep; the ST does not answer, so a motor, matrix or sensor command sent to a sleeping Bolt gets no ack at all.

After the cradle button the Bolt shows its name and battery level and is not asleep, but the ST does not answer until a wake command.

**What a Bolt forgets:**

| The Bolt holds | Yaw reset | Disconnect and reconnect | Sleep and wake |
|---|---|---|---|
| locator position | kept | kept | zero |
| yaw | zero, that is the command | kept | zero |
| stored matrix frames | kept | kept | gone |
| collision detection | kept | kept | off |
| motion stream | kept | off | off |
| infrared listen | kept | off | off |
| LED colours | kept | default pink | default pink |
| matrix picture | kept | off | off |

So every setting is sent again after each wake, and only a sleep and wake gives one defined frame: yaw 0, position 0, the locator's +y along the Bolt's front. The front and back LEDs in pink mean nobody has set them since the last sleep.

## 5 Motion

**Drive with heading**, called `roll`: speed 0 to 255, heading 0 to 359 in degrees clockwise seen from above, a flags byte with bit `01` for backward. The firmware turns to the heading and drives. It stops driving when the command is not repeated, so one roll is a nudge, a drive is rolls in a row. Speed 0 turns to the heading and stands.

**Raw motors**: a mode and a speed per wheel, modes off, forward, reverse, brake, ignore. Torque straight to the wheels; the firmware switches its stabilization off for it and stays so until stabilization is sent again. Off on both wheels is how the ball is let go of.

**Stabilization** indexes: 0 none, 1 full, 2 pitch, 3 roll, 4 yaw, 5 speed and yaw. With it off the ball does not fight being handled.

**Two frames.** The heading frame is where the firmware counts headings from. The locator frame is where it counts position. A wake lays both together: heading 0 and the locator's +y are the Bolt's front at that moment, +x is 90° clockwise from it. A yaw reset turns the heading frame to the current facing and leaves the locator axes, so after it heading and locator disagree by the angle turned. A locator reset zeroes the position and leaves the axes. Nothing but a wake brings the two frames back together.

**The sample.** The streaming mask carries orientation, accelerometer and locator; the gyro sits in the extended mask. Every sample has one layout, 13 big-endian floats, 52 bytes, in the order orientation, accelerometer, locator, gyro. The project asks for one every 50 ms, the platform's usual 20 Hz. The first packets after a mask write can be short; they are dropped.

| Value | Unit | Character |
|---|---|---|
| pitch, roll | degrees | gravity referenced, fused, no drift |
| yaw | degrees | counter-clockwise seen from above; relative to the last wake or yaw reset, drifts |
| accelerometer x, y, z | g | |
| locator x, y | metres on the wire, cm in the code | dead reckoned from wheel travel; slips are not seen |
| locator velocity x, y | m/s on the wire, cm/s in the code | derived; near zero under torque means stuck |
| gyro x, y, z | degrees per second | |

Yaw counts the other way from headings: after a yaw reset, heading equals minus yaw. The base mask starts and stops the stream, the extended mask only adds the gyro; a sample sent while the two disagree is 40 bytes and dropped. Switching the stream on does not change the position.

**Still.** The ball is still when the locator moved under 1 cm and the yaw spanned under 1° across the last half second. At rest both sit at their floors, 0.01 cm and 0.002°; after a turn the yaw is fixed from 0.7 s on.

**Compass.** Calibrate to north makes the Bolt spin and report the yaw of magnetic north as the compass event. The magnetometer's spread at a spot is what repeated spins disagree by.

## 6 Collisions

One detector in the firmware, one configuration, one notification. Configure collision takes six bytes: method (1 on, 0 off), X threshold, X speed term, Y threshold, Y speed term, dead time in 10 ms units. X is left and right, Y front and back; Z is not used. The firmware computes the power of the accelerometer signal per axis and reports when it passes threshold plus a speed-scaled term.

A threshold of 0 does not disable the axis: that axis fires every dead time, at rest too, with power 0. Both thresholds at 0 fire nothing. The reported power is on the threshold's own scale, not the excess over it: at threshold 100 a bump reports 135 to 179, at threshold 20 it reports 20 to 30. Threshold 20 with speed terms 0 is silent at rest and fires on a slow contact and on starting off alike. Threshold 40 fires on wall bumps, threshold 100 did not on rolling into a loudspeaker.

The notification is 16 bytes: impact x, y, z as int16 over 4096 g, an axis bitmask (1 X, 2 Y), power X and Y as uint16, speed, timestamp. 18 bytes with a power Z on the BOLT+.

## 7 Infrared

Four emitter and receiver pairs. Send infrared message takes a code 0 to 7 and a strength 0 to 255 for each emitter, named front, left, right, rear. The readings come back as four strengths that the project reads as front left, front right, back right, back left: the receivers sit at the corners, 45° off the nose in front and 135° behind.

A message is its channel number and nothing else: the receiver reports the channel, not who sent it. The carrier is near 38 kHz; the encoding is Sphero's own.

**Timing.** The Bolt sends on its own clock, one frame every 200.44 ms, 7.5 ms in the air, and emits no faster. A send command loads what goes out at the next sending moment, so from command to frame 0 to 260 ms pass. A receiving Bolt that listens sends the infrared notification about 45 ms after each frame it decodes, scattered by 14 ms; about one frame in ten gives a second notification some 45 ms after the first. A listen command ends with the first message and has to be sent again for the next. Get infrared readings shows the channel heard only while a frame is in the air; reads at no particular moment catch one in a hundred, reads timed into the frame two to four in ten, and since commands land on a 15 ms grid, about half the frames hold no moment at which a read can land at all.

**Reach.** A frame at a given strength is heard when the sender is roughly ahead or roughly behind the receiving Bolt, inside a lobe about 60° either side of nose and tail, and lost with the sender abeam. The stronger the frame, the wider its lobe, until it is heard all round; the weaker, the shorter its reach, until it does not arrive. Where each strength's edge lies depends on distance and room, so the ladders in `communication.ts` are chosen, not derived: long 2, 4, 8, 16 on channels 0 to 3, short 1, 2, 4 on channels 4 to 6, so a frame names its ladder and its level. Strength 16 reaches across a room of 4 m when the Bolts face each other.

## 8 Matrix, LEDs, light

The matrix is 8 by 8 RGB pixels, drawn by pixel, colour, fill, line or character, rotated in steps of 90°. Scroll text takes at most 25 characters at speeds 1 to 31 and ends with the scroll done notification. Frames and animations can be stored on the Bolt and played; sleep wipes them. A matrix picture written before the wake's reset is gone after it.

Two single LEDs, front and back, set with one command. Pink on both is the firmware's default after sleep.

The light sensor reads lux on request, about 22 reads a second with an empty queue. It sits next to the matrix, so the matrix has to be blank for a reading to mean the room.

## 9 Battery and charger

Battery voltage and battery state (unknown, ok, low, critical) are reads to the Nordic. Charger state (unknown, not charging, charging, charged) is a read and a notification; setting the ball in the cradle by hand raises it within about 2 s. The Bolt does not advertise while it sleeps in the cradle.
