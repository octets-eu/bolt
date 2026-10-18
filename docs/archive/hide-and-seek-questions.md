---
title: Hide and seek by infrared, open questions
kind: research
tags: [hide-and-seek, infrared, follow, collision, questions]
created: 2026-09-29
updated: 2026-10-01
status: open
---

# Hide and seek by infrared: open questions

What has to be answered before the infrared protocol can carry a round of
[[hide-and-seek]]. Every question can be answered without the camera: a tape
measure, the Bolts' own sensors and an eye on the floor.

## The protocol under test

1. The hider broadcasts on a channel pair (0x27, far and near) and sits still.
2. The seeker drives around.
3. The seeker hears infrared, starts a short follow (0x28) and takes the new
   heading.
4. The seeker drives slowly towards the hider, about 30 cm.
5. A collision on both Bolts ends the round; the roles swap.
6. Otherwise back to 3.

Simpler variant: the seeker stays in follow mode the whole time. The firmware
turns it towards the broadcaster, drives it there and spins it in place when
the signal is lost (Sphero Edu wiki). Our code only adds wandering when the
spin lasts too long, and the tag.

## Known, measured 2026-09-29

Two Bolts, SB-9129 and SB-11DF, on the wooden floor.

| Fact | Value |
|---|---|
| Send, 0x2a | exactly 5 bytes: channel, then front, left, right, rear strength; any other length is `badDataLength`; a side at 0 is off |
| Listen, 0x2b | exactly 5 bytes: channel bitmask (0x01 channel 0 .. 0x80 channel 7, 0xFF all, 0x00 none), then a 32-bit big-endian duration |
| Listen duration | about 0.33 ms per unit: 10000 ends between 3.3 and 3.4 s, 20000 between 6.7 and 7.0 s; 0xFFFFFFFF is weeks; 0 hears nothing |
| Listen is one-shot | one listen delivers the first message on a selected channel, then nothing until the next listen; messages on unselected channels do not end it |
| Message notify, 0x2c | one byte, the channel; the sender does not hear itself |
| Latency | send to notify 60 to 250 ms |
| Strength at 40 cm, all four sides | 1 never arrives; 2 to 4 sometimes; 8 and up reliably; 255 works like 64 |
| At 160 cm | all four sides at 16 and up arrive; one side alone arrives only at 255 or when pointed at the receiver |
| Repeatability at 160 cm | the same geometry gave 0, 6, 5 and 3 of 8 at strength 16, one side |
| Receiver readings, 0x22 | per receiver the channel heard, 255 for none; visible only a few ms per frame, 1 to 4 % of polls catch it (2026-10-01, [[infrared-external-device]]) |
| Evade, 0x33 | SB-11DF turned away from the broadcaster within about 1.2 s; SB-9129 rolled about 1 m before the stop |
| Follow, 0x28 | SB-11DF turned from 155 to about 340 degrees in 2 s and rolled about 50 cm towards the broadcaster; SB-9129, back to the broadcaster at larger distance, did not turn within 2 s |
| Facing each other | headings from evade (opposite) put each front at the other; then one side alone at 64 arrived 8 of 8 both ways |

## Open questions

### Detecting the hider

1. **Does a listen fire on a broadcaster's channels?** Hider broadcasts on
   0/1, seeker listens on 0x03. Answers whether detection needs follow at all.
2. **Which channel, near or far, is heard at which distance?** Same test at
   30, 80, 150 and 250 cm. Gives a range class: under 1 m or 1 to 3 m.
3. ~~**Range and line of sight.** Hider behind a chair leg, a table leg, a box,
   around a corner. Answers whether hiding works at all.~~ Dropped
   2026-10-02: non-issue.
4. **Can the seeker hear while it drives?** Listen while rolling past the
   hider.

### Finding the direction

5. **How reliable is follow?** Ten or more runs from different starting
   angles (0, 90, 180 degrees to the hider) and distances (50, 100, 150,
   250 cm); count turns towards the hider, time to turn, distance rolled.
6. **What does follow do without a signal?** Start follow with the hider out
   of range or hidden; watch 30 s. Spins forever, gives up, or drives?
7. **Can a follow be cut short after the turn?** Stop follow once the heading
   holds; how far has the seeker rolled by then.

### Approach and tag

8. **Does follow drive into the hider or stop short?** Five approaches.
9. **Do both Bolts register the ball-on-ball collision?** Collision events on
   both, the time between them.
10. **How is a tag told from a wall or chair bump?** Collision on both inside
    a window; the window needs the latency difference of the two Bluetooth
    links (not measured).

### Rounds

11. **Do stop follow (0x32) and stop broadcast (0x29) end the behaviours
    every time?** Five role swaps.
12. **Does a channel pair used for broadcast and follow get in the way of
    messages?** Sphero: a channel serves one purpose at a time.

## Known work before the tests

- Re-arm the listen after every received message; today lifecycle arms it
  once at connect, so a Bolt hears one message per session.

## Sources

- Sphero Edu JavaScript wiki, Communications, Events, Sensors:
  https://sites.google.com/sphero.com/sphero-edu-javascript-wiki/communications
- spherov2.py sensor commands: https://github.com/artificial-intelligence-class/spherov2.py
- Command table and earlier facts: [[bolt]], [[infrared-external-device]]
