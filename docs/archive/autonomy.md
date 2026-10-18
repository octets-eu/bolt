---
title: The road to autonomy
kind: plan
tags: [autonomy, plan, goals, gates, unknowns]
created: 2026-09-19
updated: 2026-09-19
status: living
aliases: [plan, roadmap]
---

# The road to autonomy

The far goal, the road chosen to get there, the gates along it, and where we
stand. Facts are in [[bolt]] and [[rig]], the behaviours in [[behaviors]], the
practice in [[rules]]. When an unknown here gets answered, the answer moves to
a fact book and the question is deleted.

## The far goal

Two Sphero Bolts in a room whose furniture moves. They should:

- find their cradle and charge when they need to, and leave it when full,
- roam and help the Mac map the room,
- play tag or hide and seek while the map is good enough,
- call for help when stuck, and otherwise not need a human.

The brain is the Mac, over Web Bluetooth. The Bolt has no clock, no memory
worth the name and a balance loop we cannot touch. Everything above balance is
ours and runs across a BLE round trip.

## The two roads

The first plan, written 30 August 2026, was map first: build a map by teleop,
localize in it with a particle filter, detect drift on three channels, then
explore autonomously, then two robots, then the game. It rested on an absolute
heading from the magnetometer and it was designed for unattended operation.

The measurements of 17 September broke the first premise: the north the Bolt
finds swings by over 100 degrees across the mat, see [[rig]] magnetics. So the
road now is the **minimal brain**: body-level behaviors that need no map, no
north and no memory, composed by a thin layer that picks the behavior and the
budget. Sessions are supervised by design, which licenses generous give-up
budgets and makes the human the cheapest ground truth in the system.

What the first plan still contributes, kept here so the file can go:

- **Failure is a state transition, not a wrong answer delivered confidently.**
  Drift becomes a trigger, lost becomes a mode, stuck becomes an event.
- **The dock is the best absolute fix.** Landing on the cradle fires a charge
  event with near-zero uncertainty. Docking doubles as relocalization.
- **Lost does not explore.** A robot with an unknown pose commits nothing.
- **Tag events are loop closures**, once there are two robots and a map.
- **The map is the free space of a 7 cm sphere**, not a floor plan: a table is
  legs.
- **A sphere cannot wall-follow.** Bounce-along, and fit walls to the collision
  poses, not to the path.
- The camera is a fallback referee for tag, never the brain's sensor.

## The road

### Goal 0: a body that can be trusted

Done in the core rewrite of 18 September 2026, see `packages/core/README.md`.

- Lifecycle: takeover once per connection, reset on every awake.
- Calibration: north as the mean of agreeing spins. The driver never turns a frame.
- Navigation: rotate, roll and rollToPoint, each ending on fullstop;
  rotate turns any amount by the yaw, `rollToPoint` aims by the locator
  alone and sets its speed from the locator speed.
- Streaming: accelerometer and gyro on the mask, tilt and rest from them.

### Goal 1: find the lighthouse

Finding means obtaining a bearing, repeatedly, from arbitrary placements.

```
wake
  └── trim behavior
        ├── IN TRIM ──── sweep behavior
        │                  ├── fix ────── done (goal 2 takes over)
        │                  └── no fix ─── nap 5 min ── wake
        └── OUT OF TRIM ─ jump behavior
                            ├── budget left ── trim behavior
                            └── exhausted ──── mayday behavior
```

Stateless: no map, no north, no memory between iterations. That is what makes
the jump behavior cheap.

**GATE.** A Bolt placed by hand at four known bearings reports each within
about 20 degrees. With the lighthouse off it reports no fix. It never reports a
fix while out of trim. Stationary throughout, the matrix blanked during every
sweep. Ten runs, and any disagreement inspected rather than discarded.

Measured so far, see [[bolt]] light sensor: the poll rate allows blink
identification, the lock-in at the beacon frequency finds the lighthouse where
mean brightness finds the window, and the sensor is directional to about
30 degrees. The `lighthouse` and `sweep` commands exist. The composition above
does not yet.

### Goal 2: find the charger

The lighthouse sits above the dock, so "roll below the light" and "reach the
charger" are the same problem, and no absolute heading is needed.

Composition: trim, sweep, roll on the bearing, trim, sweep, until the light
peaks, then the dock behavior. What is new against goal 1:

- Translation, which brings soft ground, collisions and slip.
- The lure and the trap are the same object: a sunlit cushion is a brightness
  maximum and a mobility trap. The blink discriminator is what keeps gradient
  ascent out of it.
- The first memory: "was that better than before?" is one bit, and it is where
  a brain begins.

Light cannot close the last centimetres; the charger event does. The capture
radius is unmeasured and decides whether docking takes minutes or hours.

### Later goals, in order

The game itself is specified in [[hide-and-seek]]: four modules, driver,
mapper, player, referee, a two-layer map, and the unknowns to measure first.

1. Leave the cradle when full and roam.
2. Map from collision poses while roaming, with per-region age and confidence,
   because the furniture moves.
3. Two robots, one shared map, tag as a loop closure. IR is the least proven
   part of the stack and sits under the tag mechanic, so it comes last; see
   [[infrared-external-device]] for the first step, an external IR beacon.
4. The game.

## Where we are

19 September 2026. Goal 0 is done. Goal 1 has its measurements and its
commands; the behaviors exist as specs in [[behaviors]], the composition and the
gate test do not exist yet. Next: reduce `calibration/` to what is needed and
extract the measured search (pulse, measure, keep what helped, budget, report)
as a primitive, then implement trim, sweep and the goal 1 loop against the
gate.

## Open unknowns

Ordered by how much they change the plan.

| | Question | Why it decides something | How |
|---|---|---|---|
| U4 | Do the streamed angles agree with accelerometer tilt on a cushion? | Agreement means the fusion is honest and trim is trivial; disagreement means every up-facing assumption inherits the error | Tilt on a cushion, log both at once |
| U5 | Does `sleep` release motor holding torque? | If yes, the nap is also the upright reset | Sleep while tilted, watch the chassis |
| U6 | Pitch and roll distribution while rolling, floor and cushion | Sets the trim threshold from data; at rest it is known, see [[bolt]] | Drive around logging angles |
| U7 | Dock capture radius and time to dock from the light peak | Minutes or hours; whether photo-taxis can hand over at all | 20 attempts from random poses at the peak |
| U8 | Wall-clock cost of one full sweep | The most frequent operation; if it costs minutes goal 2 is not viable as specified | Falls out of the poll rate and the dwell |
| M3b | Magnetic survey with the phone and speakers removed | Whether the room or the furniture spoils north | Repeat the survey in [[rig]] |
| M6 | Is the full-torque reversal audible across a room? | Whether the mayday behavior reaches a human around corners | Measure at 5 m |

Deferred decisions from the first plan, none of which blocks goals 1 or 2:
map representation, the coherence metric, contradiction clustering, the
explore-to-play gate, exploration completion, the cold-start shared frame,
hide and seek over an uncertain map, the tag protocol, rendezvous scheduling.
