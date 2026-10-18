---
title: Behaviors
kind: spec
tags: [behaviors, spec, trim, sweep, jump, mayday, dock, nap]
created: 2026-09-16
updated: 2026-10-01
status: living
---

# Behaviors

The body-level behaviours of the minimal brain. What they are for and how they
compose is in [[autonomy]]; the numbers they rely on are in [[bolt]].

## What a behavior is

> A behavior is a closed loop over sensors with a fixed setpoint and a fixed
> budget. The brain is whatever picks which behavior runs and what the budget is.

A behavior is hard-coded, purposeful, and needs no brain to execute. It is not a
reflex: every behavior runs on the Mac across a BLE link, so none is fast, and
nothing here may be given a job that must finish in less than a round trip.
The one fast loop, balance, lives in Sphero's firmware.

The ethologists' term is the fixed action pattern: innate, stereotyped,
released by a stimulus, runs to completion. That last property is the known
failure, so **every behavior has an abort condition and a budget**, and it
returns a result with a reason rather than throwing. Deciding when to abort is
the first job of the layer above.

## Vocabulary

Maritime, because that vocabulary was built for infrequent fixes, drift in
between, and a light you either raise or you do not.

| Term | Meaning |
|---|---|
| lighthouse | The beacon: the phone torch blinking at 2 Hz, see [[rig]] |
| trim | Chassis attitude. In trim or out of trim. Gates whether up-facing senses are trusted |
| sweep | The stepped rotation that samples light across headings |
| bearing | Direction to the lighthouse in the Bolt's own yaw frame |
| fix | A successful bearing. Failure is no fix, not an error |
| dead reckoning | The locator |
| mayday | The call for help |

## What the behaviors have to work with

Streamed: angles, locator position and velocity, accelerometer, gyro. Events:
charger, collision, battery, sleep and wake. Polled, one round trip each:
ambient light, which is the scarce resource; price every design in packets.
Actuators: motors, the matrix, and sleep and wake. Details in [[bolt]].

Prefer the raw accelerometer over the streamed angles for trim. The angles are
the control loop's own estimate and inherit its reference; gravity cannot lie
the same way, and `|a|` near 1 g is a free "at rest" check.

The matrix is contested by three consumers: camera marker, expression, and
light hygiene, because it sits next to the light sensor. Blank it during any
sweep. The matrix has one owner at a time, `status.matrix.owner`; the tracker
holds it while it runs and every other write is dropped, so a behavior that wants
an expression during a scored run does not get one.

## Status

| Behavior | State | Where |
|---|---|---|
| trim | measurement exists (`calibration.trim`), the pulse loop does not | `packages/core/src/calibration/calibration.ts` |
| jump | subsumed by `calibration.upright`, the measured pulse search with a help event | same |
| sweep | the readings exist as `experiments.lighthouse` and `experiments.sweep`, the behavior with trim checks and abort does not | `packages/core/src/experiments/experiments.ts` |
| mayday | not started | |
| dock | not specified | |
| nap | the plumbing exists, the loop does not | `packages/core/src/lifecycle/lifecycle.ts` |
| hop | exists as `experiments.hop`: retreat, charge at the mat lip, stop on accelerometer, collision or timeout | `packages/core/src/experiments/experiments.ts` |
| reach | first version from the 2026-09-23 measurements, `bolt.behavior.reach(target)`; untested as code | `packages/core/src/behavior/reach.ts` |
| lockOn | first version from the 2026-10-01 infrared measurements, `bolt.behavior.lockOn(channel)`; untested as code | `packages/core/src/behavior/lock-on.ts` |

## trim

**Purpose.** Establish that the chassis is upright enough for up-facing senses
to be trusted, and that the ground is drivable.

**Releaser.** Before any sweep; after any jump; periodically while moving.

**Sensors.** Accelerometer for tilt magnitude and direction, locator velocity
for stuck, streamed angles as a cross-check only.

**Actuators.** Motors, short aimed pulses.

```
until budget exhausted:
    wait for |a| ~ 1 g and the gyro quiet
    tilt, direction <- accelerometer
    if tilt < threshold: return IN TRIM
    pulse motors briefly, opposing direction
return OUT OF TRIM
```

**Abort.** Budget exhausted, escalate to jump.

**Notes.** This cannot be a servo. A proportional loop at a 100 ms round trip
and a few samples per second oscillates at any useful gain, so trim is pulse,
stop, measure, pulse. Measure only at rest: the chassis swings after any move,
and the gyro says when it has stopped. On the floor gravity rights the wheels
by itself; on a cushion the chassis lies on its side and stays there, which
is what the jump is for.

## jump

**Purpose.** Random restart. Escape a state trim cannot descend out of.

**Releaser.** Trim budget exhausted, or torque commanded with locator velocity
near zero.

**Sensors.** Accelerometer for aim and for the before and after comparison.

**Actuators.** Raw motor pulses, brief.

**Loop.** Aim opposite the tilt, pulse, stop, re-run trim.

**Abort.** Hard cap on the count. It is the most expensive action in the
system and fires when the battery is lowest.

**Notes.** Trim is local descent and the cushion is a local minimum; when
controlled action cannot succeed, variance is the resource. Bias the input,
accept the scatter. Safety follows from the releaser: a ball free enough to be
dangerous would have passed trim. A jump destroys position, heading and north
together, and that costs exactly one re-sweep, because nothing was stored.
Spins right the chassis in steps; straight pulses launch a free ball.

## sweep

**Purpose.** Obtain a bearing to the lighthouse, or report no fix.

**Releaser.** The brain decides to look. Must be preceded by in trim.

**Sensors.** Ambient light polled, yaw at each step, accelerometer per step.

**Actuators.** Motors, rotate in place stepped; matrix blanked throughout.

```
blank matrix
for each of ~12 steps of ~30 degrees:
    rotate, stop, settle
    verify IN TRIM, else abort
    dwell at least one blink period
    lock-in amplitude at the beacon frequency
bearing    <- argmax over steps
confidence <- amplitude ratio best to worst
return (bearing, confidence) or NO FIX
```

**Abort.** Out of trim mid-sweep; budget exceeded.

**Notes.** Stepped, not continuous: a continuous spin tilts the apparent
gravity vector outward and corrupts the trim check. The blink is the
discriminator: windows, lamps and a television are DC; the lock-in at the
beacon frequency finds the lighthouse where mean brightness finds the window.
The bearing is never stored. It is produced and consumed at once, which is why
yaw drift does not matter and why this behavior needs no north, no map and no
memory.

## mayday

**Purpose.** Bring a human.

**Releaser.** Jump budget exhausted; battery critical with no fix; any behavior's
terminal failure.

**Sensors.** Accelerometer for pickup, `|a|` far from 1 g; charger event for
docked; trim, since it may have self-rescued.

**Actuators.** Motors in rhythmic bursts, they are loud and that is the point;
matrix red.

**Loop.** Burst and blink for N seconds, check trim, nap M minutes, repeat.

**Abort.** Picked up, docked, or self-rescued.

**Notes.** Two channels because they fail differently: LEDs need line of sight
and someone looking, and the behavior fires exactly when the robot is occluded;
motor noise goes around corners. Rhythmic, not continuous, because humans
filter constant sound. It says "here", not "why"; the Mac knows why and can
say so in words. Duty-cycle for the battery, for the motors, and above all for
the operator's patience: a Bolt calling every ninety seconds is worse than one
that waits. The bursts are a weak jump, so checking trim between them
occasionally self-rescues for free.

## dock

Goal 2, not yet specified.

**Purpose.** Make charge contact.

**Releaser.** At the light peak, or battery low with a fix.

**Sensors.** Charger event as the terminal truth, collision for the cradle
rim, ambient light for the peak.

**Actuators.** Motors, expanding spiral.

**Abort.** Radius budget exceeded, then mayday.

**Notes.** Light cannot close the last centimetres: the gradient flattens at
the peak, so photo-taxis delivers the right half-metre and the charger event
does the rest. The capture radius is unmeasured.

## nap

Not a behavior; the state the machine lives in.

Stop keeping the Bolt awake and stop talking. The Bolt announces `willsleep`,
then `didsleep`. Wake with `wake`; it reaches a Bolt in `sleep` and nothing
reaches a Bolt in `deepSleep`, so **never `deepSleep` in a nap path**. There is
no onboard timed wake: the Mac holds the alarm clock, which is the first
concrete instance of the architecture, the body has no clock. Given the duty
cycle, napping is where the machine spends most of its life, and no fix is the
ordinary case, not a failure. A sleep wipes the firmware's configuration, so a
reset follows every wake.

## reach

**Purpose.** Roll to a point; where something is in the way, find out
whether going on in that direction is possible, and go over it if it is.
Obstacles in scope: the mat's 1 cm lip (over) and a wall (not over).

**Releaser.** A target point, from the brain.

**Sensors.** Pitch, as the sign of contact and of climbing; the locator for
distance while nothing is in the way; the collision event as a weak hint.

**Actuators.** `actuators.motor.*` only, no `navigation.*`: the behavior owns
its loop.

**Loop.** Explore toward the target at a low command; on contact back off and
charge; after the charge decide passed or blocked.

**Abort.** Blocked after a charge, or the time budget.

**Measured** (2026-09-23, floor to mat and floor to a pillar, lamp light,
camera for the truth):

| Fact | Value |
|---|---|
| Contact at exploring speed, command 40 | pitch rises to 30 to 43 degrees and stays, 8 of 8 (5 lip, 3 wall) |
| Locator at contact | not a sign: at the wall the wheels spin and the locator keeps reporting speed, so "moved, then still" missed a contact (1 of 3 wall runs) |
| Lip or wall at contact | not distinguishable: pitch 36 to 43 at the lip, 27 to 43 at the wall; accelerometer 1.3 to 3.2 g at either; no collision event at either |
| Pushing harder from contact, roll command 50 to 255 in steps of 10 | does not climb the lip: the chassis tips inside the shell, 66 degrees from command 70, 81 to 92 from 120, nothing changes from 130 to 255 (1 of 1) |
| Back off, then charge at 100 | the lip crossed 3 of 3 when the charge reached it; the wall blocked 2 of 2 |
| Back off by the locator at 50 | 27 to 42 cm for 20, the reverse includes a 180 degree turn |
| At the lip during the charge | impact 2.7 to 4.0 g, then 40 cm/s again at pitch 37 to 51 while climbing, later pitch -30 to -37 while rolling onto the mat |
| At the wall during the charge | impact 2.2 to over 5.5 g; in one run pitch stayed 47 to 79 for about 0.9 s while the locator reported 10 to 41 cm/s |
| Collision event during the charge | wall 3 of 3, lip 2 of 4: no discriminator |
| Locator speed right after the impact | wall: down to about 2 cm/s for 150 to 200 ms, then back up as the wheels spin (2 of 2); lip: dips to 14 to 22 cm/s and recovers within about 100 ms (2 of 2). The candidate sign for passed or blocked |
| Locator as proof of passing | not usable: at the wall it counted the spinning wheels as 15 cm of progress |
| Open-loop without contact first | 70 with 15 cm run-up blocked, 100 with 20 cm crossed (1 each) |

**Open.** Whether the speed right after the impact tells passed from blocked
beyond these 4 runs; pitch in the first half second after the impact does not.
Other lip heights, carpet, a rug edge.

**Notes.** At exploring speed the behavior cannot know what it hit, so the
charge is also the test. Contact is read from pitch, never from the locator.
Motors off (`motor.off`) at about 50 cm/s let the chassis tumble, pitch -90 to
+96 and 7 s of swinging; a stop that keeps stabilization does not.

## lockOn

**Purpose.** Turn to face another Bolt by infrared; the first half of a
tag in [[hide-and-seek]].

**Releaser.** A channel, agreed with the sender. The sender sends that
channel weakly (0x2a at strength 2, one frame per 200 ms); its loop is not
part of the behavior.

**Sensors.** The listen notify on the channel (presence, about 5 per s);
0x22 once per track for front or back.

**Actuators.** `actuators.motor.*` and `communication.state`, no `navigation.*`.

**Loop.** search (infrared slot `infra-listen`) until a notify; track
(`tracking`): find both edges of the zone heard, 20 degree steps then
halved to 5, aim at their middle, turn 180 if 0x22 says back; locked
(`infra-listen` plus the mark `locked`, white corners). No notify for 1 s:
back to search. The matrix shows the slots through `communication.state`;
the motor slot blinks with the infrared one.

**Abort.** A collision (the end of the tag), a fullstop, or a zone without
an edge.

**Measured** in [[infrared-external-device]], 2026-10-01: the 200 ms frame
limit, the strength ladder, the side null at 50 cm (deaf at both sides,
edges sharp to 10 to 20 degrees, zone width differs per Bolt), the 0x22
hit rate.

**Open.** Lock time and accuracy; the null at other distances; whether a
turn trips the collision event.
