---
title: Infrared from an external device
kind: research
tags: [infrared, m5stack, beacon, research]
created: 2026-09-19
updated: 2026-10-01
status: plan
---

# Infrared: talking to a Bolt from an external device

Researched 19 September 2026. Question: can an M5Stack Core with an IR unit act
as a beacon that Bolts hear, follow or evade? Short answer: Bolt to
microcontroller is proven by others, microcontroller to Bolt is untested but
nothing known stands in the way. Nobody has published the on-air encoding, so
the first step is to capture it ourselves.

## How an IR link works

- An IR LED (940 nm) is switched at a carrier, almost always 38 kHz.
- The receiver is a module with photodiode, bandpass filter on the carrier,
  automatic gain control and demodulator. Its output goes low while a carrier
  burst is present, high otherwise. Room light and sunlight do not pass the
  filter, which is why a cheap LED reaches several metres.
- Bits are encoded in the lengths of bursts and gaps. Every protocol (NEC,
  Sony, RC5, Sphero) is just a different table of burst and gap lengths.
- A 38 kHz module tolerates a carrier a few kHz off; 36 to 40 kHz all work
  with reduced range.

## What the Bolt has

- Four emitter and receiver pairs: front, left, right, back. So a Bolt knows
  which side a message came from, and follow and evade steer on that.
- Eight channels, 0 to 7. A message is nothing but a channel number. The
  receiver fires an event per channel and reports the channel, not who sent it.
- Intensity 1 to 64 is the emitter drive per side. Sphero words it as
  "proportional to proximity", 1 nearest, 64 farthest.
- Broadcast, follow and evade take a channel pair: a near code sent weakly
  (under 1 m) and a far code sent strongly (1 to 3 m). A follower turns
  toward the side that hears the broadcaster and uses near versus far as a
  distance estimate. When it loses the signal it spins in place to search.
  This is exactly the beacon role.
- A channel can be used for one purpose at a time: messaging, broadcasting,
  following or evading.
- Sphero quotes up to 4 m range.

## Command set on SB-9129

All on device 0x18 (sensor), ST processor, target 0x12. Every CID below is in
the supported list recorded in commands.md. Names and parameters from
spherov2.py; the two marked untested were never verified there.

| CID | Name | Parameters |
|---|---|---|
| 0x22 | get bot-to-bot infrared readings | none; the reply is 4 bytes, one per receiver (front left, front right, back right, back left): the channel that receiver is hearing, 255 for none. Visible only for a few ms per frame, so most polls read 255 (2026-10-01) |
| 0x27 | start broadcasting | far code, near code |
| 0x28 | start following | far code, near code |
| 0x29 | stop broadcasting | none |
| 0x2a | send message | exactly 5 bytes: channel, front, left, right, rear strength; a side at 0 is off (2026-09-29) |
| 0x2b | listen for messages | exactly 5 bytes: channel bitmask (0x01 = channel 0 .. 0x80 = channel 7), then a 32-bit big-endian duration, about 0.33 ms per unit; one-shot, the first message on a selected channel ends it (2026-09-29) |
| 0x2c | message received notify | async, one byte: the channel |
| 0x32 | stop following | none |
| 0x33 | start evading | far code, near code |
| 0x34 | stop evading | none |

Not supported on this Bolt: 0x3e enable IR message notify and 0x3f send IR
message with per-side strengths. Those are the RVR variants; spherov2 wrongly
routes Bolt messaging through them, which is why its IR support is marked
TODO.

## What is known about the signal on the air

- A teacher (Garrett Gross, 2018) drove an Arduino servo from Bolt messages
  6 and 7 using a plain 38 kHz receiver module and the IRremote library. So
  the Bolt's carrier is close enough to 38 kHz for a standard module.
- IRremote did not recognise the protocol and reported the two messages as
  UNKNOWN with hash values E95897BF and CC1C9F5A. The hash is an FNV over the
  relative burst lengths, so it proves the encoding is Sphero's own and that
  it is stable per channel. It says nothing about the bit layout.
- No raw timings have been published. The Sphero community forum threads on
  external IR emitters are offline (the host no longer resolves).
- Unknown: whether intensity only changes LED current or also the encoding,
  whether the frame carries a checksum, and the exact carrier.

## External device: M5Stack

- Starter: the M5 Core already here plus an IR Unit U002 on the Grove port.
  Core, Core2 and CoreS3 have no IR built in; the U002 adds one 940 nm LED
  and one 38 kHz demodulating receiver. Both halves are needed, the receiver
  first. Capture, decode and the first replay all happen on this.
- Range upgrade, only if the U002 falls short: StickS3. Emitter on G46 and a
  38 kHz demodulating receiver on G42 built in, ESP32-S3, 250 mAh battery,
  Grove port, so it can run as a beacon on the mat unplugged. Caveats from
  the M5 docs: receive with RMT only, switch the speaker amplifier off while
  receiving, keep at least 30 cm between sender and receiver. Current
  product; the StickC Plus2 is discontinued.
- StickC, StickC Plus and Atom have an emitter only. Fine for the beacon once
  the encoding is known, useless for capture.
- ESP32 RMT peripheral produces the carrier and arbitrary burst timings in
  hardware. IRremoteESP8266 sendRaw with a frequency argument uses it.
- Range: M5 quotes the U002 at under 5 m, Sphero quotes the Bolt's own
  emitters at 4 m, and the far code is meant for 1 to 3 m. So no extra
  electronics. IR LEDs have a narrow beam, about 20 degrees each side, so aim
  the unit at the mat. If range still falls short, move the beacon closer or
  go to the StickS3.

## Measured 2026-09-29 (Bala2 Fire, Unit IR on Port B)

Setup: M5Stack Fire (ESP32-D0WDQ6-V3, 16 MB) in the Bala2 base, USB bridge
CH9102 (1A86:55D4) served by the macOS built-in driver, no extra driver.
Plain MicroPython 1.29 (ESP32_GENERIC-SPIRAM). Unit IR on Port B: emitter
G26, receiver G36 (Port A is the Bala2 I2C, Port C the PSRAM). Code in
beacon-infrared/micropython: capture.py, send.py.

- MicroPython on ESP32 has no hard pin IRQ and RMT is transmit only, so
  capture.py polls the GPIO input register from a viper loop.
- Capture: SB-9129 sent channels 0 to 7 at strength 64 on all four sides,
  three times each. Every send gave exactly one frame; the three repeats of
  a channel decode identically.
- Frame: 8 bits, pulse-width coded, about 1 ms per bit, no header, no
  repeat. Receiver output: 1 = burst 640..667 µs, gap 338..367 µs;
  0 = burst 312..369 µs, gap 628..689 µs. Read most significant bit first:

  | Channel | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
  |---|---|---|---|---|---|---|---|---|
  | Byte | 00 | E1 | D2 | 33 | B4 | 55 | 66 | 87 |

  The eight bytes are an error-correcting code (any two differ in at
  least 4 bits); the Bolt corrects 1 wrong bit and drops 2 or more, see
  Pieces.
- Replay: send.py sends the byte at 38 kHz, 33 % duty, 1 = 650/350 µs,
  0 = 330/670 µs. Both Bolts, listening with 0x2b on all channels, reported
  the 0x2c notify with the right channel: channel 3 and channel 6, each
  heard by SB-9129 and SB-11DF. Distance and angle were not measured.

- Broadcast (0x27 [far, near] on SB-9129, same position, gapless capture
  with capture.run(s, 500000)): the frames are the message frames, same
  bytes per channel. Per cycle of about 200 ms the near code comes first,
  the far code 17 ms after it (end to start), then 168 ms idle. Frame about
  7 ms.
  - [2, 1] for 4 s: 20 far (2) and 19 near (1). Near bursts arrive shorter
    (long 608, short 286 µs) than far (643, 313 µs): a weaker signal at
    the receiver.
  - [1, 2] for 8 s: 40 far (1), no near (2) at all; 193 ms between far
    frames. The weak near frame did not reach the M5 in this run.
  - So the first byte is far (strong), the second near (weak), as
    spherov2 names them. Near reception at this spot is marginal.
    Distance was not measured.

- Both Bolts compared (SB-11DF at 1 m, SB-9129 at 2 m, line of sight to
  the M5):
  - Messages 0..7 at strength 64: identical bytes, timings within 15 µs.
  - Broadcast [2, 1] for 5 s each: only the far code 2 arrives, every
    200 ms (193 ms idle), from both. The near code reaches neither at 1 m.
- M5 carrier duty sweep, three sends per duty, both Bolts listening and
  re-armed after each receive: 33, 20, 10, 5 and 2 % reach both. At 1 %
  SB-11DF (1 m) heard 3 of 3, SB-9129 (2 m) 1 of 3. The difference fits the
  distance; a swap of places would separate Bolt from distance. 1 % is the
  lowest duty esp32.RMT takes as an integer percent.
- Duplicate notify: re-armed within ~70 ms of a receive, a Bolt sometimes
  reports the same frame again 40 to 90 ms later (a frame lasts ~7 ms).
  Five sends gave 7 notifies on SB-11DF and 6 on SB-9129; both Bolts do it.

- Swapped places (SB-9129 at 1 m, SB-11DF at 2 m), 1 % duty, six sends:
  SB-9129 6 of 6, SB-11DF 0 of 6. The 1 % difference follows the distance,
  not the Bolt.
- Follow on the M5 beacon (beacon.py: near 1 at 1 % then far 2 at 33 %,
  200 ms cycle; SB-9129 at 1 m, 0x28 [2, 1], motion stream held, locator
  sampled every 100 ms): the Bolt started moving within 0.4 s, swung its
  yaw from 92 to -133 in 2 s, then rolled steadily at ~30 cm/s. After 3.8 s
  it reached the 60 cm safety limit and got a fullstop. It settled 53.7 cm
  from the start by the locator. rollToPointAdaptive(start, 'floor')
  returned 'arrived' in 3.1 s, errorCm 3.2; 1.5 s later the locator put it
  3.6 cm from the start. The camera tracker was off. The beacon
  process of this run hung and never reported its cycles, so the run is not
  counted.
- Follow, second run (same setup, beacon verified: 150 cycles in 30 s,
  timeout-wrapped). Locator: 37 cm at ~30 cm/s, a curve to a stop at 2.9 s,
  a turn on the spot for 1 s, then a second leg at ~35 cm/s until the 60 cm
  limit at 5.3 s. After the fullstop (motors off) and 0x32 it lay 76.8 cm
  from the start. Return: rollToPointAdaptive 'arrived' in 2.8 s,
  errorCm 0.6, locator 0.5 cm from the start.
  Seen by the user, the Bolt starting roughly facing the M5: a triangle.
  About 40 cm to the right, a turn, a leg toward the M5 that ended near it
  (at the limit), then the return to the start. So follow found the M5
  after one wrong leg. The first leg length matches the locator (37 cm).
  The locator return matched the start by eye.

- Aim (resetYaw) twists heading against the locator axes (rules.md: never
  reset yaw; the Aim button came 2026-09-25, locatorOffset was retired
  2026-09-22). After the user aimed both Bolts away from the M5: a
  heading-0 leg ran at -94 (SB-9129) and -26 (SB-11DF) in locator axes.
  Realigned without code: turn to heading -twist, resetYaw, keep "away" as
  the heading +twist. Check leg on "away": within 1 degree on both. Note:
  measured yaw counts counter-clockwise, heading = -yaw.
- Return with aligned frames: SB-9129 2.2 cm, SB-11DF 12.7 cm and 14.2 cm,
  all reported 'arrived'. SB-11DF lands 13 to 14 cm off; not explained.
- Follow facing away (both at once, beacon verified 150 cycles, limit
  100 cm, travel direction from the locator relative to "away"; 180 is
  toward the M5):
  - SB-9129 (1 m): 1.4 s of wobble, then left (-58 to -86), then a
    clockwise curve through +90 to 180 from 5.1 s, 7.7 s to the limit;
    net 102 cm at 176, toward the M5. Found it.
  - SB-11DF (2 m): turned right to +88 within 1.1 s and drove straight at
    ~38 cm/s until the limit at 3.8 s; net 110 cm at 85. Never turned to
    the M5.
  - No collision event on either. Returns: SB-9129 21.6 cm, SB-11DF 6.2 cm.

- Follow facing away, repeat (places swapped since the first away run,
  confirmed after the run by the 1 % test: SB-11DF 5 of 4 sends heard
  incl. a duplicate, SB-9129 0; pointed away by hand, "away" read from the
  yaw, no resetYaw; beacon 150 cycles):
  - SB-9129 (2 m): straight to the right, +61 to +89, limit 100 cm at
    3.7 s. Off course, as the user saw.
  - SB-11DF (1 m): toward the M5 (180 +- 25) from 0.9 to 4.1 s, a curve
    (+138, +105), still from 5.1 to 8 s, then slow at +30 to +57 until
    12 s; net 73.6 cm at +140.
  - Returns, two rollToPointAdaptive calls each: SB-9129 0.3 cm,
    SB-11DF 5.2 cm.
  - At 2 m only the far code (33 %) arrives reliably, the near code (1 %)
    not. SB-11DF's place in the first away run was not tested at the time.
- Follow facing away, third run (swapped: 1 % test just before, SB-9129
  heard 4 of 4 plus duplicates, SB-11DF 1 of 4; beacon 150 cycles):
  - SB-11DF (2 m): turned through +112, +132 to toward the M5 (150 to
    180) within 1.7 s and held it; limit 100 cm at 4.9 s, net 111.9 cm at
    +172. Found the M5 from 2 m.
  - SB-9129 (1 m): toward the M5 from 1.3 to 3.0 s, then a loop (+163 to
    +46, then -92 to -109, then back to 180); limit at 7.5 s, net 96.9 cm
    at -164.
  - Returns, two calls: SB-9129 1.1 cm, SB-11DF 0.4 cm.
- Tally of follow from facing away: at 1 m found 3 of 3 (SB-9129 twice,
  SB-11DF once); at 2 m found 1 of 3 (SB-11DF found once; SB-9129 off
  course once, confirmed; SB-11DF off course once, place unconfirmed).
  Neither distance nor Bolt decides it alone; three runs at 2 m are too few.
  - Every wrong first leg so far went to the right of the Bolt's facing
    (+60 to +90): run 2, SB-11DF at 2 m, SB-9129 at 2 m.

- 0x22 during follow and at rest (2026-10-01, M5 beacon on the
  floor; SB-11DF blue at 1 m, SB-9129 green at 2 m; beacon cycles
  verified each run). Reply bytes in the order front left, front right,
  back right, back left; 255 = nothing heard.
  - Follow, both facing the M5, beacon far 2 / near 1, polls every
    ~160 ms: 1 of 16 polls per Bolt other than 255. SB-11DF following
    `2,2,2,255`, SB-9129 not following `2,2,255,2`. The value is the
    channel; follow is not needed. All baseline polls before follow 255.
    Follow reached the 60 cm limit at 3.2 s, return 2.4 cm.
  - At rest, beacon far 5 / near 3, polls back to back every ~52 ms:

    | Bolt, M5 is | Polls | Readings other than 255 |
    |---|---|---|
    | SB-11DF, behind | 225 | `255,255,3,3` 3, `255,255,5,5` 1, `255,5,5,5` 2, `5,5,5,5` 3 |
    | SB-9129, ahead | 224 | `5,5,5,255` 2, `5,5,255,5` 3 |
    | SB-11DF, right (turned +90) | 177 | none |
    | SB-11DF, right, listen armed | ~160 | `255,5,5,255` 4, `255,5,5,5` 3; 61 notifies, all 5 |

    The facing pair hears every frame: ahead bytes 1+2, behind 3+4,
    right 2+3. This confirms the order front left, front right, back
    right, back left; M5 on the left is not tested. The weak near frame
    (3, 1 % duty) arrived only on the facing pair and only at 1 m.
  - A reading never showed on two polls in a row 52 ms apart. Hit rate 1
    to 4 % of polls; with one or two frames per 200 ms cycle that fits a
    window of a few ms (inferred, the sampling moment inside a poll is
    unknown). This is why the earlier checks always read 255.
  - Listen armed or not, alternating 3 s blocks, 4 each, SB-11DF (M5
    right) and SB-9129 (ahead): readings in 3 of 343 polls with listen
    off, 8 of 272 with listen armed. Off blocks after the first had one
    late notify each (0x2b with five zeros did not cancel at once).
    Readings with listen off in the first block on both Bolts, no notify
    there: listen is not needed. Whether it raises the rate is open (3
    vs 8 is too few).

- Aiming at the M5 by 0x22 alone (2026-10-01, M5 far 5 / near 3, both
  Bolts within 1 m, placed until the near notify arrived). Turning by the
  mean angle of the hearing receivers brought both within 45 degrees, then
  oscillated +-45: near near-facing, the weak frame lands on front left
  alone or front right alone, alternating. A sweep -50..+50 in 10 degree
  steps, 4 s each, there and back, took 132 to 135 s; front right alone
  never showed (the coarse aim had stopped on front left alone, so the
  beacon lay left of the sweep). The front pair heard from -39 to +7 on
  SB-11DF, wider than 20 degrees. Turns land within about 5 degrees.
- Bolt to Bolt, 50 cm apart, facing each other (2026-10-01):
  - Broadcast, 15 s each, SB-11DF [far 1, near 2], SB-9129 [5, 6], then
    both: the receiver got every far frame (75 and 74 notifies), no near
    frame at all (0 notifies on 2 and 6). Both at once lost nothing.
  - A broadcasting Bolt reads its own channels in 0x22, mostly on all four
    receivers (`2,2,2,2`, `5,5,5,5`); its notify does not fire for them.
  - Far frames at the receiver: from SB-11DF `1,1,1,1` (all four, no
    direction), from SB-9129 `5,5,5,255` and `5,5,255,255`.
  - Message ladder (0x2a, all four sides, every 200 ms, 10 s per strength;
    readings of 0x22 for the sent channel, ~135 polls per strength):

    | Strength | SB-11DF to SB-9129 (ch 3) | SB-9129 to SB-11DF (ch 4) |
    |---|---|---|
    | 2 | 46/46 notified; FL+FR 4 | 47/48; FR 1 |
    | 4 | 46/46; none | 48/48; FL+FR 3 |
    | 8 | 47/47; none | 48/48; FL+FR 1 |
    | 16 | 46/48; all four 2 | 47/48; FL+FR+BR 2 |
    | 32 | 46/48; none | 48/48; all four 2 |
    | 64 | 48/48; all four 1 | 47/47; none |

    Every strength from 2 arrives at 50 cm. Strength 2 to 8 lands on the
    front receivers only, 16 and up spills to three or four. Too few
    readings per row to tell the Bolts apart.
  - Send rate (SB-11DF sends channel 3 at 2, SB-9129 polls 0x22 only,
    10 s each): 5 sends/s 8 of 213 polls (3.8 %); 20 sends/s 1 of 174
    (0.6 %). Faster sending did not raise the rate; the drop is not
    explained.
  - The Bolt emits at most one frame per 200 ms (M5 capture, SB-11DF
    channel 3 at 64, 5 s each): 25 sends at 5/s gave 24 frames, 92 sends
    as fast as acked gave 25 frames; gaps 192.75 to 192.76 ms in both,
    frame plus gap 200 ms. All sends were acked, the extra ones never
    went out.
  - Notifies per heading (SB-11DF sends channel 3 as fast as acked,
    SB-9129 turns 12 x 30 degrees from facing it, 3 s per heading, re-arm
    after each notify, at most ~5 per s):

    | Heading | 0 | 30 | 63 | 90 | 122 | 151 | 180 | -147 | -119 | -89 | -60 | -32 |
    |---|---|---|---|---|---|---|---|---|---|---|---|---|
    | strength 2 | 12 | 15 | 6 | 0 | 8 | 15 | 14 | 15 | 10 | 0 | 10 | 9 |
    | strength 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |

    At strength 2 front and back hear, both sides do not (0 at +90 and
    -89): a null narrower than 60 degrees. Strength 1 barely reaches at
    50 cm. One run, one receiver.
  - 0x22 against the 200 ms beat (SB-11DF sends channel 3 at 2 every
    200 ms, SB-9129 polls 0x22 back to back and re-arms listen after
    each notify, 60 s): 265 sends, 220 notifies, 933 polls, 16 readings.
    Notify spacing minus 200 ms: p10 -44, p50 -3, p90 +44 ms; poll
    round trip p50 51 ms, p90 101 ms. Readings by poll start after the
    last notify: 15 of 313 polls (4.8 %) from 100 to 150 ms, 1 of 620
    (0.2 %) elsewhere; best 10 ms bin 3 of 27. Timing by notify triples
    the rate per poll, but one poll per beat fits the window, so the
    readings per second stay about the same (0.27 per s continuous).
  - Side null, both ways (sender channel 3 at 2 every 200 ms, receiver
    3 s per heading, notifies, at most ~15 per 3 s; heading measured
    from yaw, 0 = facing the sender):

    | Receiver | Hears | Silent |
    |---|---|---|
    | SB-9129 (from SB-11DF) | 0: 11, 61: 8, 108: 2, 121: 13, -55: 12, -69: 9, -120: 8 | 83, 88, 102; -79, -91, -100, -110, -115 |
    | SB-11DF (from SB-9129) | 0: 14, -61: 13, -62: 12 | 63, 83, 88, 99, 110, 119; -81, -88, -101, -110, -118, -120 |

    Both Bolts are deaf at both sides to a strength 2 frame at 50 cm. The
    edges are sharp: from 8 to 13 notifies to 0 within 10 to 20 degrees.
    SB-9129 hears up to about +-70 and again from about +-110 (the back,
    as in the 30 degree run). SB-11DF hears up to about +-62 and nothing
    from 63 to 120 either side; its back was not tested. The lobe widths
    differ between the Bolts (one run each).
- Bolt to Bolt, 4 m apart, on the floor, facing each other (2026-10-02):
  SB-9129 (green) sends channel 1 by 0x2a on all four sides every 200 ms,
  SB-11DF (blue) listens and re-arms after each notify.
  - Facing, 10 s each: strength 64 gave 48 notifies for 49 sends, 0x22
    `1,1,255,255` 2 of 177 polls; 255 gave 47 for 48, `1,1,255,255` 2
    and `1,1,1,255` 2 of 155 polls.
  - Facing, 5 s each: 32 gave 28 notifies for 24 sends (duplicates), 16
    gave 6 for 25, 8, 4, 2 and 1 none.
  - Notifies per heading (blue turns 12 x 30 degrees clockwise from its
    start heading, which faced green; 3 s per heading, at most ~15):

    | Strength | 0 | 30 | 60 | 90 | 120 | 150 | 180 | 210 | 240 | 270 | 300 | 330 |
    |---|---|---|---|---|---|---|---|---|---|---|---|---|
    | 64 | 14 | 14 | 13 | 14 | 12 | 11 | 13 | 12 | 9 | 12 | 13 | 14 |
    | 32, an object behind blue | 14 | 14 | 5 | 3 | 3 | 12 | 14 | 14 | 8 | 0 | 4 | 8 |
    | 32, nothing behind blue | 14 | 12 | 14 | 0 | 0 | 14 | 13 | 15 | 15 | 0 | 0 | 11 |
    | 24 | 13 | 9 | 13 | 0 | 0 | 14 | 15 | 14 | 14 | 0 | 0 | 1 |
    | 16 | 3 | 9 | 3 | 0 | 0 | 0 | 8 | 13 | 12 | 0 | 0 | 0 |

    64 is heard at every heading. From 32 down both sides are deaf, as at
    50 cm at strength 2; with the object behind blue the sides were weak
    instead (one run each, consistent with a reflection). Lower strength
    narrows the lobes: at 16 the front lobe peaks at 30 alone. Front and
    back lobe centers lie opposite, about +15/+195 at 32 and +30/+210 at
    16; whether green lay off blue's start heading or the receivers are
    skewed is not separated.
  - 0x22 does not tell front from back here: at 64 the front pair read
    at 180 and 210; at 32 with nothing behind 3 readings in 36 s, all on
    a back receiver while facing (`255,255,255,1` 2 at 0, `255,255,1,255`
    1 at 30).

Steps 1, 2, 4 and 5 are done. Open: intensity (3), beacon with follow (6),
range, carrier tolerance, how the M5 makes a weak near frame (one LED:
lower carrier duty or distance).

## Pieces for a beacon routine (collected 2026-09-29, no code yet)

Established:

- The M5 speaks Bolt: any channel as message or broadcast pair, heard by
  both Bolts (beacon.py, send.py).
- Follow toward the M5 works from 1 m: 3 of 3 from facing away, and from
  facing it. A wrong first leg goes right of the facing, +60 to +90.
- The locator keeps counting while the firmware drives follow; a return
  by locator lands within 0.3 to 5 cm with two rollToPointAdaptive calls.
- Room reference: the Bolt pointed away from the M5 by hand, "away" read
  as the heading from the yaw (heading = -yaw). No resetYaw: it twists
  heading against the locator axes.
- Reconnect keeps the heading frame and the locator axes; it zeroes the
  locator position. reset turns 360 in place (jam check), no north.
- The notify tells only "frame on channel X arrived": no side, no
  strength. Counting needs a re-arm after each notify (40 to 70 ms blind,
  sometimes a duplicate). The side is in 0x22: per receiver the channel
  heard, but a poll catches it in only 1 to 4 % of polls (measured
  2026-10-01).
- Reach of the M5 frame by carrier duty: 2 % and more reach 2 m; 1 %
  reaches 1 m (6 of 6) but mostly not 2 m (0 to 1 of 4, 1 of 3).

Working hypothesis:

- Follow needs a strong signal. At 2 m it found the M5 1 of 3 times; there
  the near frame at 1 % mostly does not arrive, only the far one. Test:
  near frame at 10 %, both Bolts at 2 m, three runs.

Open:

- Listen and follow at once on the same channels, or only alternating.
- A strength ladder from the M5 (same message at several duties on
  separate channels) as a distance proxy; whole-percent duty limits it.
- Two broadcasters, the M5 and a Bolt, on different channel pairs: does
  a follower given one pair ignore the other? Both send on a 200 ms
  cycle, 7 ms frames; in phase they would collide every cycle.
- Bolt to Bolt talk, since each Bolt is its own brain (hide-and-seek.md:
  the Bolts know only their own senses) and speaks only by infrared and
  collision. A frame is 3 bits (channel 0 to 7); a longer message takes
  several frames, e.g. a direction in 8 sectors in one frame, 64 in two.
  Needs: channels apart from the beacon pair (6 left beside 2/1), an order
  of frames (a channel set per slot, or a start marker), duplicates dropped
  (same channel within ~100 ms). Rate: single frames 1.2 to 2 s apart are
  measured reliable, faster is not measured. A shared direction is only
  meaningful relative to the beacon ("away" is the same for both Bolts);
  each Bolt's own heading frame is not.
- No free bits in a frame (measured 2026-09-29, both Bolts, each byte sent
  twice from the M5, listening on all channels). The eight bytes are an
  error-correcting code: any two differ in at least 4 bits. A byte 1 bit
  from a valid one is corrected to it (0x73 arrived as 3, 0x01 as 0, not
  1); 2 or more bits off is dropped (0x03, 0xF3, 0x0B). The four bytes that
  would extend the code to 16 words (0x78, 0x4B, 0xCC, 0xFF) were dropped:
  no channels 8 to 15. A frame carries exactly 3 bits; more information
  takes more frames.
- One send is one frame, no repeat, no acknowledgement; a listener that
  was not armed misses it. The sender repeats, a reply frame confirms.
- The model: 8 buttons of different colour. A press is one flash of
  ~7 ms, one colour, all four sides the same colour, strength per side
  (the receiver does not see strength). The colour is the payload, 3 bits.
  Broadcast presses two buttons, near then far 17 ms later, every 200 ms.
- No two colours at once: send takes one channel. Two senders at the same
  moment overlap into one byte the code most likely drops (inferred, not
  measured). Two flashes 17 ms apart cannot both be read by listen: the
  re-arm after the first takes 40 to 70 ms.
- Reading: listen with mask 0xFF reports each colour; re-arm after every
  notify; a duplicate can follow 40 to 90 ms later; beacon colours are read
  too, so talk colours stay apart from the beacon pair. The sender does not
  hear itself (hide-and-seek-questions.md).
- Longer messages are sequences, like Morse: 2 flashes 64 values (a
  direction in 5.6 degree steps), 3 flashes 512. Pauses could carry
  information too; whether Bluetooth timing keeps them is not measured.
- Turn taking (the user's idea): A counts 0..7, then listens; any frame
  tells B where A is in the count, so B knows when A's turn ends without
  hearing 7. The count spends all 8 colours on timing: content needs a
  split (e.g. 5 to 7 as the clock, 0 to 4 content) or an agreed end colour.
  Round trip: A sends a burst, then listens; B answers on another colour
  after A's burst is over, or repeatedly, and once per burst.
- Direction: 0x22 shows which receivers hear a frame (measured
  2026-10-01): the pair facing the sender, a strong frame sometimes on a
  third receiver too, a weak one only on the facing pair. The sender can
  give it: one side alone arrives at 160 cm only at strength 255 or when
  pointed at the receiver; at 16 the same geometry gave 0, 6, 5 and 3 of
  8; facing each other one side at 64 arrived 8 of 8 (hide-and-seek-
  questions.md). A lighthouse: A turns flashing the front only, B answers
  when it hears one, A knows the bearing. Coarse and noisy so far.
- Who: follow reports nothing (no notify, no "found"); the source is
  chosen by its colour pair (M5 2/1, a Bolt 4/3). Whether a listener hears
  a broadcaster's colours is open question 1 in hide-and-seek-questions.md;
  if yes, a Bolt learns who is in range before it follows.
- Rate: the key unknown. Measure: A sends 0..7 at 1000, 500, 250 and
  125 ms spacing, B listens and re-arms, count what arrives.
- rollToPointAdaptive stops short after a turn in place on returns under
  ~22 cm (a 100 to 150 ms surge after the turn trips the stop); planned:
  speed toward the target over 2 to 3 samples, then check at rest and
  correct.

## Plan

1. Capture. Bolt sends channels 0 to 7 at one intensity, aimed at the M5
   receiver at about 30 cm. Record raw timings per channel with RMT or
   IRremoteESP8266 in raw mode. Ten repeats per channel.
2. Decode. Line up the eight captures. Expect a header burst, a fixed bit
   count, and the channel number somewhere in the bits. Check whether the
   frame repeats while the message is active and at what period.
3. Intensity. Repeat one channel at intensities 1, 16, 64. If the timings
   are identical, intensity is LED current only. If not, note the change.
4. Broadcast. Start broadcasting with a far and near pair and capture both
   frames. Compare with plain messages on the same channels.
5. Replay. M5 sends the captured frame at 38 kHz. On the Bolt, listen with
   0x2b and watch for the 0x2c notify over BLE. Vary the carrier 36 to 40 kHz
   if nothing arrives.
6. Beacon. M5 alternates the near and far frames. Bolt starts following with
   the same pair. Watch whether it turns toward the M5.

## Risks

- The Bolt receiver may sit at a different carrier than 38 kHz. Step 5 finds
  it.
- The frame may carry a checksum or an identity. Step 2 shows a constant
  block if so; replay still works because the frame is copied whole.
- Near versus far may be intensity only, which a single LED cannot fake
  well. Then the beacon can broadcast but distance from one M5 is meaningless.
- Sphero's follow behaviour relies on four receivers hearing different
  strengths. A beacon that is too strong saturates all four and the Bolt
  loses direction. Start weak.

## Bolt+

On Bolt+ every sensor command moves to target 0x11 (single SoC). The UNSW
fork of spherov2 that drives Bolt+ in classrooms lists IR communication as
not working yet, so there is no evidence either way that Bolt+ hears a Bolt
or an M5.

## Sources

- AT-ST remix with the Arduino sketch and the hash values:
  https://edu.sphero.com/remixes/2845580
- IRremote decodeHash: http://www.righto.com/2010/01/using-arbitrary-remotes-with-arduino.html
- spherov2 sensor commands and Edu docstrings:
  https://github.com/artificial-intelligence-class/spherov2.py
- M5Stack IR Unit U002: https://docs.m5stack.com/en/unit/ir
- Sphero BOLT features: https://help.sphero.com/sphero-support/bolt-features
- sphero_unsw Bolt+ fork: https://github.com/redaghanem/sphero_unsw
