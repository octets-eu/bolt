---
title: Hide and seek
kind: plan
tags: [hide-and-seek, game, mapper, player, referee, driver, room]
created: 2026-09-19
updated: 2026-09-19
status: draft
aliases: [the game]
---

# Hide and seek

Two Bolts, one room, no camera. One hides, one seeks, the Mac keeps the map
and referees. This is the far goal of [[autonomy]] made concrete; the numbers
behind it are in [[bolt]] and [[rig]].

## The game

- The **hider** picks a hiding place from the map, drives there, sits, and
  answers infrared when something comes close.
- The **seeker** visits the good hiding places in order, then searches
  systematically, and closes in when it hears infrared.
- A **tag** is a collision on both Bolts at the same moment, confirmed by
  infrared and by the map saying they are together.
- Roles swap after every round.

The Bolts know only their own senses: locator, IMU, collisions, infrared,
charger. The map lives on the Mac. Nothing in the loop sees a camera.

## How a game starts and ends

**Before the first round**

1. Both Bolts charged and at the beacon, which is the charger cup and the
   origin of the map. Their locators are zeroed there, with a declared
   offset between the two.
2. The map has walls established: the truth layer from the tape measure, the
   Bolt layer reproducing it, see below. Without walls there are no hiding
   places and no corner fixes, so the mapper's exploration runs first.
3. The referee assigns roles and lights the Bolts accordingly.

**A round**

1. The referee starts the hider. The hider asks the mapper for a hiding place,
   drives there, reports hidden. The seeker waits at the beacon, matrix
   blanked, for the report or for a head start of a fixed length.
2. The referee starts the seeker.
3. The round ends on a **tag**, or on the seeker's **budget** (time or
   distance), or on **loss**: a Bolt whose position the mapper no longer
   trusts and that cannot re-fix at a corner, or a Bolt asking for help.
4. Both drive back to the beacon. Docking re-zeroes the locators. Roles swap.

**A game ends** after a fixed number of rounds, when either battery is low,
when a Bolt is lost and does not recover, or when the human says stop. The
referee reports the score and the log.

## What a human observer sees

- Two Bolts at the charger cup, one lit blue, one red, matrix off.
- The blue one drives off, follows a wall for a bit, turns behind the sofa,
  stops. Sits there, dark. It gives itself away only when the seeker is near,
  by infrared, which the human cannot see.
- The red one rotates in place a few times, pauses between turns, drives to
  the first corner it fancies, bumps a chair leg, backs off, tries another
  way. Rotates again. Drives on. Once it hears infrared it rotates a last
  time and heads straight for the source, bumps the hider. Both flash white.
- Both drive back to the cup, one after the other, and the colours swap.
- On the Mac's screen: the map with walls, furniture cells and both Bolts'
  believed positions, the referee's log with round, elapsed time and the
  reason the round ended, and the score. When the mapper corrects a frame
  after a corner fix the position on the map jumps.
- What the human hears: motors, bumps, and the seeker's rhythmic bursts if it
  gives up and calls for help.

The human is allowed to move a chair between rounds. That is the point of
the map having an age.

## The four modules

| Module | Does | Knows | Does not know |
|---|---|---|---|
| **Driver** | A to B on the Bolt's own senses, around or over small obstacles; reports every pass, bump, hop and stall with the pose it had | its own Bolt, the frame it was given, the target | the map, the other Bolt, the game |
| **Mapper** | keeps the map; hands out targets for exploration; answers "hiding places", "path to X", "nearest corner"; corrects each Bolt's frame from bumps, docking, corners and contacts | both Bolts' reports, the truth layer, the ages | roles, rounds, who is winning |
| **Player** | one per Bolt; hider or seeker; asks the mapper, commands the driver, sends and listens to infrared | its role, the mapper's answers, its Bolt's events | the other Bolt's position, the map internals |
| **Referee** | starts and ends rounds, assigns roles, confirms tags from both Bolts' collisions and infrared plus the mapper's distance, orders the return to the beacon, keeps score and the log | both Bolts' events, the mapper's positions | how any of them do their job |

Concerns that stay outside all four, in the existing core: the link,
lifecycle and reset on wake, righting the chassis, battery and sleep, the
session log.

Two rules:

- Players never touch a motor and never read the map's cells. A player that
  cheats can only cheat through the mapper's answers, which are the same for
  both.
- The referee trusts no player. A tag needs both collisions, infrared, and
  the mapper agreeing they are within a ball's width.

## The mapper and uncertainty

The Bolts, the mapper and the truth layer will not agree to the centimetre
between fixes. So every believed position carries an uncertainty and every
decision uses it. Two levels; the drift measurement decides whether the
second is ever needed.

**Level one, a radius.** Each Bolt's believed position carries an error
radius. It grows with distance driven and with every bump since the last fix,
and collapses at a fix: the cup, a wall, a corner, a contact. The grid is
written in log-odds, so a bump reported with a large radius nudges a cell and
one with a small radius sets it. The radius answers:

- when to re-fix: before it reaches half the distance between corners,
- which corner it is: the only one inside the radius,
- what reproducible means: two passes agree within the sum of their radii,
- how much of the Bolt-drawn furniture to believe.

A room is walls everywhere, so a Bolt is never more than a few metres from a
fix. The error between fixes is bounded by the fix cadence, which the mapper
sets; it is a policy, not a property of the Bolt.

**Level two, particles.** Needed when the belief is several blobs, not one:
the Bolt could be at either of two corners, or it was carried and set down.
Then Monte Carlo Localization against the truth map, with a bump as one beam
hitting at 5 cm and a leg without a bump as free space along the path only,
never beyond the ball. It converges slowly on bumps alone, dozens of them,
which is why level one is there to keep it from being needed. Written here
if needed; the Python bump-SLAM recipes feed grid mappers fake lidar and get
the free-space half wrong, clearing cells the ball never visited.

**What is accurate anyway.** The map's global accuracy is the truth layer's,
centimetres, because the Bolt layer is stitched between fixes. Only the
furniture drawn between two fixes carries the drift of that stretch, and the
radius says how much.

## How the map is built

The map is a grid in centimetres, origin at the charger cup, two layers.

**Truth layer.** Walls as line segments from the tape measure or a laser
distance meter, furniture footprints at floor level as polygons, since the
ball lives at 7 cm and a table is four legs. Fixed for the session. Used by
the mapper for corner fixes and by the referee to judge the Bolt layer.

**Bolt layer.** Cells of 10 cm with a state and an age: unknown, free,
blocked, hoppable. Written only by the Bolts' reports:

- A pass marks free.
- A bump marks the cell in front of the reported pose blocked, at the heading
  it was pushing.
- A hop over it marks hoppable, a failed hop marks wall.
- Cells age back to unknown, so a moved chair heals.

**Exploration**, before the first game and whenever the referee asks:

```
map empty, both Bolts at the beacon, locators zero
repeat
    target <- nearest unknown cell touching a free one, inside the current ring
    path   <- Dijkstra over free and unknown cells
    drive; the driver reports passes, bumps, stalls
    on ring done, or drift budget spent: re-fix, then next ring
until the walls reproduce and no bump has landed in a free cell for a pass
```

Frontiers are split between the two Bolts. No hops and no raw pulses while
exploring; a whirl voids the leg and the Bolt re-fixes first.

**Frames and drift.** Each locator is zeroed at the cup in its own boot
heading; the declared start offset relates the two. Drift comes from slip and
mostly from heading; 5 degrees puts a wall 4 m away 35 cm off. The mapper
corrects a Bolt's frame from four channels and no others:

| Channel | Gives |
|---|---|
| docking, the charger event | position: the cup |
| a wall, two bumps along it | heading, and one coordinate, against the truth layer |
| a corner, wall followed to the next wall | heading and both coordinates |
| a contact between the two Bolts | the two frames are at the same point |

Walls are fitted as lines to the collision poses and snapped to right angles.
A wall that comes out bent is the odometry. A corner is accepted only if both
its walls are known lines already; the nearest corner to the believed position
is the one, which holds while drift is under half the distance between corners.

**Reproducible** means: a second pass along each wall, after a re-fix, agrees
with the first within a tolerance that scales with distance from the last
fix, and no bump has landed in a free cell for a full pass.

## Unknowns

### The driver: A to B over surfaces, small obstacles, walls

Known: A to B by heading and locator on the floor lands within 0.1 cm after
one leg; the hop command retreats and charges a lip; blocked is locator
velocity near zero under torque, a collision at threshold 40, or tilt about
15 degrees wedged. All measured on the mat and hard floor, see [[bolt]].

Open:

- Speeds, run-ups and stall signatures on carpet, parquet, a rug edge, a
  cable. The mat numbers will not carry over.
- Whether a bump is a wall or a leg: at least three bumps on a line say wall,
  one bump says obstacle; the driver reports, the mapper decides, but the
  driver has to know when to probe along the surface for the second bump.
- Heading drift per metre and per bump in the room.
- The bug loop: on blocked, hop or detour, which side, remembered for the leg.

### The mapper: from Bolt reports to a map

Open: the cell size against the ball's 7 cm and the line fits; the age of a
cell against how often furniture moves; merging two frames from two Bolts
with a declared offset and contacts; the tolerance in "reproducible"; hiding
places as a visibility query over the wall lines; the systematic search as
coverage over the free cells.

### Architecture in this project

Exists: `packages/core`, the driver in four layers for one Bolt;
`packages/web-ble`, one connection; `packages/protocol`, message schemas
including a `position` family; `apps/browser`, the page, commands, plotter,
session log worker.

Open:

- Two Bolts in one page is solved: the Bolt manager keeps a list of core
  instances, one transport each, and the old app ran two Bolts this way for
  years. The latency and jitter between the two links is unmeasured.
- Where mapper, players and referee live: as pure TypeScript packages like
  core, driven from the page, with the map persisted across sessions in
  IndexedDB or a file.
- The session log on disk: every report, every decision, both Bolts, one
  clock. This is the prerequisite for anything learned later, and it does
  not exist yet.
- The map view: grid, walls, both positions, ages, live.

### External libraries, apps, tools

Nothing is required. Dijkstra over a grid, a line fit with outlier rejection
and a visibility query over segments are each a screen of TypeScript, and
the room is small enough that none needs a dependency. Tools: a laser
distance meter or a tape measure for the truth layer. An external infrared
beacon on an M5Stack is a separate track, see [[infrared-external-device]].

### Floor map format

Proposal, to be settled when the first room is measured:

```json
{
  "version": 1,
  "unit": "cm",
  "origin": "charger cup, x along the wall behind it, y into the room",
  "walls": [ { "from": [0, 0], "to": [412, 0] }, { "from": [412, 0], "to": [412, 355] } ],
  "furniture": [ { "name": "sofa", "polygon": [[20, 300], [180, 300], [180, 355], [20, 355]] },
                 { "name": "table", "polygon": [[200, 100], [204, 100], [204, 104], [200, 104]], "note": "one leg" } ],
  "hoppable": [ { "name": "rug edge", "from": [0, 200], "to": [412, 200] } ],
  "beacon": [0, 0]
}
```

Polygons at floor level. A table is its legs. Rug edges and thresholds as
hoppable lines, since they matter to a ball and not to a floor plan.

### Importing the map

Open: a JSON file under `apps/browser` loaded by the mapper at start, hand
authored from the measurements, is enough for one room. Whether an editor
in the page is worth it, and whether the Bolt layer should be exported in the
same format so a mapped room can seed the truth layer next time, are open.

## Before any of this is written

Each an afternoon with two Bolts, anywhere:

| Unknown | Decides |
|---|---|
| Latency and jitter between the two links | the referee's coincidence window |
| Infrared send and receive on the real Bolt, receive arc against range | whether the seeker gets a side, and whether a hider is heard across a room |
| Ball on ball collision signature | whether a tag is detectable at all |
| Locator drift per metre and per bump in the room | how often a Bolt must re-fix |
