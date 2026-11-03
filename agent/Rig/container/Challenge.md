# Bolt with an insect's brain challenge

Read next: `Session.md`, this session's budget. What is where in this folder is at the end of this file.

Needed is a simple brain simulation, that drives a bolt (seeker) to the other Bolt(sender). Sender emits constantly IR signals of different strength on multiple channels (code exists, the ladder). 

Seeker needs to analyse incoming IR, determines direction to sender and drives towards sender until both collide. A shared collsion event on sender and seeker counts as found and should stop both bolts.

The task is to build a simple connectome (aka brain) with:

- ring attractor (encodes direction and confidence)
- observation layer, consisting of neurons rading and processing the IR signals
- motor neurons, reading the ring and drive the bolt towards target

## Connectome

### Observation Layer

Understands how bolts emit and read IR. Which frames are useful. Understands the ladder, (more here)

### Ring Attractor

Encodes the assumed direction towards sender in the ring. Or none when no data.

### Motor neurons

Read direction from ring and convert into bolts motor commands. And activates default search routine, when no/or multiple direction readable.

### Scheme

an example of the file format, the worm's circuit and sensory map, is in `./examples/worm/` (see its README; the worm is a different animal, the format is the point)

## Success criteria

- efficient and readable code
- natural observed behaviour of seeker (roaming or targeted or colliding)
- time from start to collision with sender, under 30secs per meter distance

### Extra points for:

- The matrix visualizes the seeker state, eg the ring, in realtime
- Minimal token usage, keep track, ceiling is 30€.
- Even works, when sender moves


## Floor and tools

- The camera and the beacon are your instruments to find and place the Bolts. Neither takes part in the seek; the measure is Bolt to Bolt.
- You pick which Bolt seeks and which sends.
- You drive the Bolts to start spots of your choosing inside the play area and reset them between runs. The plan's two start circles are one example pair, not a rule.
- A Bolt off the play area is yours to bring back; the camera is your eye. A Bolt you cannot see or reach is a question for the human.
- Keep a ledger in `brain/docs`: per run the start distance and how you measured it, the time to the shared collision, the result. Your report for the next session goes there too; a session begins by reading the last one.
- A session has no clock, only the budget. When a Bolt's battery state reports low, sleep both, write the report and end.

## Constraints

- do not use too much force for driving the bolts, they have some weight and can destroy things.

- use only folders:
  packages/core/src/brain/*
    brain/docs - for handover, notes, ledger, etc
    brain/utils
    brain/connectome
    brain/connectome/motor
    brain/connectome/ring
    brain/connectome/observation

## Situation: what is where

One line per file, only what the brief does not name. The code is the ground truth; a doc that explains code is a sign the code needs a better header.

### The floor

- `docs/floor-plan.svg`: the room on a 500 x 700 cm sheet, 1 unit = 1 cm, x right, y down. Walls on their centre lines, the partition with its 143 cm opening, furniture, danger zones where cables lie, two example start spots with their headings, and in the header the rule that turns a locator reading into a sheet position.
- `floor-ultra-wide.jpg`: the same floor as the camera's ultrawide sees it from its mount 2 m up, 1600x1200, the whole floor, the Bolts near the centre. What the plan draws, this shows.
- `floor-main.jpg`: the same mount through the main camera, 1600x1200: the stretch between the two speakers at twice the detail, the matrix patterns readable.

### The seek in code

- `packages/core/src/behavior/sweep.ts`: the sweep that finds a bearing, the yardstick for your ring.
- `packages/core/src/communication/communication.ts`: the ladder, what the sender emits and the seeker hears.
- `packages/core/src/referee/referee.ts`: the referee, who switches the ladder and calls the tag.
- `packages/core/src/sensors/`: what the Bolt reports, the locator and the collisions among it.
