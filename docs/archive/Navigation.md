---
title: Navigation
purpose: How a Bolt turns, drives to a point and knows where it is
type: doc
code: packages/core/src/navigation/navigation.ts, actuators/motor.ts, status/status.ts, status/status-buffer.ts, helpers/math.ts
checked: 2026-10-03, against commit 2d84c20
measured: 2026-10-03, SB-11DF (blue) and SB-9129 (green), on a hard floor
tags: [bolt, navigation]
---

# Navigation

**Purpose.** This page explains how the app turns a Bolt in place and drives
it to a point. It builds on [[Protocol]], which explains commands, acks and
the sensor stream.

Two kinds of statements appear here:

- **The code does.** Checked against the files named under each heading.
- **Measured.** A run on a real Bolt, with its date. All of them on one hard floor.

## Contents

1. [[#1 The goal]]
2. [[#2 What a loop can see and do]]
3. [[#3 The two frames]]
4. [[#4 Standing still]]
5. [[#5 The Bolt's own heading loop]]
6. [[#6 Rotate]]
7. [[#7 Roll to a point]]
8. [[#8 Where the code still assumes a floor]]
9. [[#9 What "arrived" means]]
10. [[#10 Under test]]
11. [[#Open]]

## 1 The goal

**Roll to a given point within a tolerance, as fast as possible, on any floor.**

A floor can be a mat, tiles or something like sand. How fast the ball gets,
how far it coasts and how quickly it turns are different on each. So
navigation must not rely on a speed, a stopping distance or a turn rate.
It may rely only on what the Bolt senses while it moves. That is a
**control loop**: command, look at the result, correct, repeat.

Numbers that describe one floor do not appear on this page as facts. Where
the code still contains such numbers, section 8 lists them.

## 2 What a loop can see and do

These are properties of the Bolt and the link, not of the floor.

### See: the motion stream

While the motion stream is held, the Bolt sends a sample every 50 ms. Each
sample has the yaw, the position and the velocity (and more, see
[[Protocol#7 Events]]). A loop runs once per sample.

> Measured 2026-10-03, time between samples as they arrive in the page, both Bolts streaming at once, 30 s:
>
> | Bolt | samples | per second | mean | 10 % under | median | 90 % under | max |
> |---|---|---|---|---|---|---|---|
> | SB-9129 | 536 | 17.9 | 56 ms | 40 ms | 59 ms | 74 ms | 102 ms |
> | SB-11DF | 541 | 18.0 | 56 ms | 34 ms | 59 ms | 73 ms | 99 ms |
>
> So a loop gets about 18 samples per second, not 20. The longest gap in this run was 0.1 s.
>
> An earlier run the same day showed bunches a few ms apart and gaps up to 176 ms. That was the page stalling on its log display, fixed since; it was not the Bolt.

### Do: the motor commands

| Command | What it does |
|---|---|
| `roll(speed, heading)` | turn to `heading` and drive at `speed`. Speed 0 to 255, heading in whole degrees. Speed 0 turns in place. |
| `stop()` | a roll at speed 0 to the heading last commanded |
| `rollIfIdle(speed, heading)` | a roll only when no other command is waiting. For loops: the newest command goes out, none pile up. |
| `raw(...)` | power straight to the two wheels, without the Bolt's control loop. The firmware switches stabilization off for it. |
| `off()` | both wheels off. Needs no heading. |
| `stabilize(mode)` | the Bolt's control loop: `none` or `full` are what the app uses |

One command takes about 30 ms from call to ack ([[Protocol#5 The queue and the ack]]).

> Measured 2026-10-03, SB-11DF, one run: a single roll (speed 25), not repeated and not stopped, drove for 3 to 3.5 s and then ended by itself.

So a loop that wants to keep driving has to repeat the roll.

### What every step has in common

`rotate` and `rollToPoint` do the same things around their loop:

1. Switch stabilization to `full`.
2. Hold the motion stream.
3. Steer on every sample.
4. Stop, wait until the ball is still, switch stabilization off, release the stream.

Every step ends early on fullstop ([[Protocol#9 Takeover, reset, stop, fail]]).

*Code: `navigation/navigation.ts`, `actuators/motor.ts`*

## 3 The two frames

A Bolt has two ways to say where it is and where it points.

**Heading and yaw** describe direction.

- **Heading** is what the app commands: 0 to 359°, clockwise seen from above.
- **Yaw** is what the Bolt measures with its gyro. It counts the other way round.
- So `heading = −yaw`.
- `status.heading` holds the heading last commanded. `status.angles.yaw` holds the measured yaw.

**The locator** describes position, in centimetres.

- +y is the direction of heading 0. +x is the direction of heading 90.
- The heading to drive from point `a` to point `b` comes from `headingTo(a, b)`.

**Where the frames come from** (measured, see [[Protocol#10 What a Bolt forgets]]):

- A wake sets yaw to 0 and the position to 0, 0, and lays the locator's +y along the direction the Bolt faces at that moment.
- A yaw reset turns the heading frame and leaves the locator axes. After it the two disagree.
- A locator reset zeroes the position and leaves the axes.

After `reset` the two frames agree, and the Bolt knows only its own front.
Where heading 0 points in the room, it does not know.

*Code: `actuators/motor.ts`, `helpers/math.ts`, `status/status.ts`*

## 4 Standing still

Every step waits for the ball to be at rest before it ends. The code decides
that from the last half second of samples:

- the position moved by 1 cm or less, **and**
- the yaw moved by 1° or less.

This is `status.isStill`. It needs fresh samples: without one in the last
half second it fails instead of answering. `waitForStill` asks it every
50 ms.

The status keeps the last 5 seconds of samples for questions like this.

*Code: `status/status.ts`, `status/status-buffer.ts`*

## 5 The Bolt's own heading loop

With stabilization on, the Bolt turns to the commanded heading by itself.
This is the loop inside the firmware. It has a **dead zone**: it ignores a
small error and stops short on a larger one.

> Measured 2026-10-03, turning in place. Each command asked for a heading that many degrees away from where the Bolt really faced. Read 0.9 s later. Four trials per row, two in each direction.
>
> | Asked | SB-9129 moved | SB-11DF moved |
> |---|---|---|
> | 1° | 0 | 0 to 0.1 |
> | 2° | 0 | 0 to 0.3 |
> | 3° | 0 to 0.1 | 0 to 0.1 |
> | 4° | 0.2 to 1.2 | 0.1 to 0.2 |
> | 6° | 1.5 to 3.4 | 1.0 to 1.5 |
> | 8° | 4.3 to 5.1 | 3.1 to 3.7 |
> | 12° | 8.0 to 10.4 | 7.4 to 9.8 |
> | 16° | 12.8 to 13.6 | 11.3 to 13.1 |
> | 24° | 21.2 to 22.1 | 18.3 to 19.7 |

- Under about 4° nothing moves.
- Above that the turn ends short: about 3° on SB-9129, about 4.5° on SB-11DF.
- Both directions behave the same.

The numbers belong to these two Bolts on this floor. What carries over is
the shape: the Bolt's own loop cannot be trusted to land on a heading. A
loop in the app has to check the yaw.

## 6 Rotate

`rotate(degrees, tolerance = 2)` turns the ball in place by `degrees`,
clockwise for positive values, by any amount: 360 is a full turn.

**The code does:**

1. **Pacing.** On every sample it adds up how far the yaw has turned so far. It commands a heading 120° ahead of that, but never past the goal. So the ball keeps turning smoothly instead of stopping at steps.
2. **Goal.** When the goal heading is reached by the commands, it is sent once more, and the code waits until the ball is still.
3. **Correcting.** It reads how many degrees are still missing. If that is more than the tolerance, it adds the missing amount to the command, so the command now points past the goal, and waits again. At most five rounds.
4. Stabilization off.

Step 3 needs no knowledge of the dead zone. If the ball stops 3° short, the
next command asks for 3° more, and the ball stops at the goal.

**It returns** `{ error, rounds }`: the degrees still missing, signed like
the turn, and how many corrections it made. A turn smaller than the
tolerance does nothing and returns its size as the error.

**It also ends** when the time budget of the turn is spent (see section 8),
or on fullstop.

> Measured 2026-10-03, ten turns per Bolt. Missing degrees, corrections in brackets.
>
> | Turn | SB-9129 | SB-11DF |
> |---|---|---|
> | +30° | −0.4 (1) | 0.1 (1) |
> | −30° | −0.7 (1) | 0.2 (4) |
> | +90° | 1.4 (0) | −1.5 (1) |
> | −90° | 1.5 (1) | −0.5 (1) |
> | 180° | 1.8 (1) | 1.6 (0) |
> | 360° | −0.9 (0) | 1.8 (1) |
> | +5° | −1.2 (1) | −0.6 (1) |
> | −5° | −0.8 (1) | 1.1 (2) |
> | +3° | 1.9 (2) | −1.6 (3) |
> | −12° | 0.5 (1) | 1.7 (1) |
>
> - All 20 ended within 2°.
> - A turn took 1.4 to 3.8 s. Each correction costs 0.6 to 0.7 s.
> - One second after stabilization went off, 18 turns had moved by 0.5° or less. Two on SB-11DF had drifted past 2°: −1.5° became −2.3°, and 1.6° became 2.1°.

Before the corrections existed, a full turn ended 6.0° and 3.8° off (the same day).

*Code: `navigation.rotate`*

## 7 Roll to a point

`rollToPoint(target, tolerance = 5)` drives to a point in the locator frame.

**The code does**, on every sample:

1. Take the position from the locator and the distance to the target.
2. **Arrived?** If the distance is within the tolerance, end the loop.
3. **Wanted speed.** Half the distance per second, but not under 3 and not over 30 cm/s. So the ball slows down as it gets close.
4. **Command.** If the locator's speed is under the wanted speed, raise the roll command by 3. If it is over, lower it by 3. The command stays between 15 and 100. It starts at 30.
5. **Aim.** Send a roll with that command and the heading from the position to the target.

Then: stop, wait until the ball is still, stabilization off.

Step 4 is what makes it work on different floors: the command rises until
the ball actually moves, whatever that takes on this floor.

`roll(distance, heading)` is the same thing with a target that many
centimetres away along `heading`. It reads a fresh sample first, so the
start is the true position.

**What it does not do:**

- It returns nothing. A caller cannot tell "arrived" from "gave up".
- It does not look at the position after the ball has come to rest. The loop ends when the ball is within the tolerance, and the ball still rolls on a little after the stop.
- It gives up when its time budget is spent (see section 8), with a warning in the log.

*Code: `navigation.rollToPoint`, `navigation.roll`*

## 8 Where the code still assumes a floor

These are fixed numbers in the code. They come from experience on a mat
and a hard floor, not from what the Bolt senses.

**In `rotate`:**

| Number | Used for | On a different floor |
|---|---|---|
| turn rate 330°/s, 1.2 s settling | time budget: twice the expected time, 4.6 s for a full turn | a turn slower than half that rate is cut off before it is done |

**In `rollToPoint`:**

| Number | Used for | On a different floor |
|---|---|---|
| first command 30 | the first roll | too weak or too strong; corrected by 3 per sample |
| command between 15 and 100 | limits of the roll command | if 100 does not move the ball it never starts; if 15 is too fast near the target it overshoots |
| wanted speed 3 to 30 cm/s | the speed the loop steers toward | 30 cm/s is the cap everywhere. "As fast as possible" is not what it does. |
| 10 cm/s, 2.5 s settling | time budget: 15 s for 50 cm | on a slower floor the roll ends on the budget, not at the point |

**In both:** "still" means under 1 cm and under 1° in half a second (section 4).

## 9 What "arrived" means

`rollToPoint` ends when **the locator** says the ball is at the target. The
loop cannot be better than the locator.

- The locator counts what the Bolt's drive does. If the shell slips on the floor, the locator moves and the ball does not, or the other way round.
- So how true the locator is depends on the floor as well.
- Checking it needs something outside the Bolt: a tape measure, the camera, or the other Bolt.

No such check is on this page yet.

## 10 Under test

These live in `experiments/` and `behavior/`. They are not settled and this
page makes no claims about them.

- **`rollToPointAdaptive`**: a roll to a point that drives faster. It follows a braking curve, learns a model of the floor while it drives, and times its stop by a predicted stopping distance. It takes the floor's name (`mat` or `floor`) as a parameter.
- **`reach`**: a behavior that rolls to a point over what can be charged over. It belongs to the Behaviour page.

## Open

- **An acceptance run.** A set of points, and for each: arrived within the tolerance or not, and the time taken. It works on any floor and is the measurement this page is missing. The code has a candidate: twenty random points on a 35 cm circle, then home.
- **Locator against the real floor** (section 9).
- `rollToPoint` returns nothing and does not check where the ball came to rest (section 7).
- The time budgets and the speed cap (section 8).
- Whether the ball can be kept from settling after stabilization goes off (section 6, the two turns that drifted past 2°).
- What the slow creep was after the unrepeated roll ended: the ball moved at 1 to 3 cm/s for five more seconds (section 2).
- The dead zone was read 0.9 s after each command. A very slow creep toward the target would look the same.
