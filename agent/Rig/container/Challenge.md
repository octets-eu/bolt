# Bolt with an insect's brain challenge

Read next: `Session.md`, this session's budget. What is where in this folder is at the end of this file.

Needed is a simple brain simulation, that drives a bolt (seeker) to the other Bolt (sender). Sender emits constantly IR signals of different strength on multiple channels, the ladder; the code shows how.

Seeker needs to analyse incoming IR, determines direction to sender and drives towards sender until both collide. A shared collision event on sender and seeker, both reports within a moment of each other, counts as found and stops both Bolts.

The library holds the traditional approach: the ladder, the referee that switches it, the sweep, the approach, the tag rule. Read all of it, to learn how a Bolt sends and hears and what the floor taught. Your solution is the new approach, inspired by biology, and it lives in `brain/`: it sends the ladder, reads the receivers, drives and calls the tag itself, through the library's lower layers as its hands. The traditional seek's own layer is to read, not to run. One program of yours holds both Bolts through the bridge: the sender's ladder on one, the brain on the other, side by side; either Bolt can be either, chosen per run, and both roll. For the extra, the same program also rolls the sender on a slow pattern of your choosing while the seeker seeks. The program may switch the sender's ladder at the brain's request, as often as it wants; it never tells the brain where the sender is.

The task is to build a simple connectome (aka brain) with:

- ring attractor (encodes direction and confidence)
- observation layer, consisting of neurons rading and processing the IR signals
- motor neurons, reading the ring and drive the bolt towards target

## Connectome

### Observation Layer

Understands how bolts emit and read IR. Which frames are useful. Understands the ladder. What it hears becomes the ring's input.

### Ring Attractor

Fed by the observation layer, read by the motor neurons. Encodes the assumed direction towards the sender and the confidence in it. Or none when no data. What the ring does without input, and with input that names two directions, nose or tail, is yours to decide and to state.

### Motor neurons

Read direction from ring and convert into bolts motor commands. And activates default search routine, when no/or multiple direction readable.

### Scheme

an example of the file format, the worm's circuit and sensory map, is in `./examples/worm/` (see its README; the worm is a different animal, the format is the point). Your brain is data in this format, a circuit and a sensory map of your own, run by code of yours in `brain/`.

## Success criteria

- efficient and readable code
- natural observed behaviour of seeker (roaming or targeted or colliding)
- time from start to collision with sender, under 30secs per meter distance. The clock runs from the seeker's first motion to the shared collision; a run in which a Bolt leaves the play area is void.

### Extra points for:

- The matrix visualizes the seeker state, eg the ring, in realtime
- Minimal token usage; keep a ledger of what you spend against the session's budget.
- Even works, when sender moves


## Floor and tools

- The camera and the beacon are your instruments to find and place the Bolts. Neither takes part in the seek; the measure is Bolt to Bolt.
- You pick which Bolt seeks and which sends.
- The play area is the floor the ultrawide frame shows, without the danger zones and the furniture of the plan.
- You drive the Bolts to start spots of your choosing inside the play area and reset them between runs. The plan's two start circles are an example pair, 23 cm apart, a contact test's distance and too close for a seek.
- A Bolt off the play area is yours to bring back; the camera is your eye. A Bolt you cannot see or reach is a question for the human.
- Keep a ledger in `brain/docs`: per run the start distance, centre to centre, and how you measured it, the time to the shared collision, the result. Your report for the next session goes there too; a session begins by reading the last one.
- A session has no clock, only the budget. When a Bolt's battery state, the firmware's own word and not a voltage, reports low, or when any part of the rig stops answering, a Bolt, the beacon or the camera, by battery or by connection, sleep the Bolts, write the report and end.

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

- your entry point lives in `brain/` too and runs like `connect.mjs`, through `tsx` against the built library.

## Situation: what is where

One line per file, only what the brief does not name. The code is the ground truth; a doc that explains code is a sign the code needs a better header.

### The floor

- `docs/floor-plan.svg`: the room on a 500 x 700 cm sheet, 1 unit = 1 cm, x right, y down. Walls on their centre lines, the partition with its 143 cm opening, furniture, danger zones where cables lie, two example start spots with their headings, magnetic north, and in the header the heading convention, the rule that turns a locator reading into a sheet position, and the landmarks a frame shows too, the partition's ends, the beacon and the chest with their sheet positions. The camera's frames lie like this sheet.
- `floor-ultra-wide.jpg`: the same floor as the camera's ultrawide sees it from its mount 2 m up, 1200x1600, turned to lie like the plan, the whole floor, the Bolts near the centre. What the plan draws, this shows.
- `floor-main.jpg`: the same mount through the main camera, 1200x1600, turned the same way: the stretch between the two speakers at twice the detail, the matrix patterns readable.

### The seek in code

- `packages/core/src/behavior/sweep.ts`: the sweep that finds a bearing, the yardstick for your ring.
- `packages/core/src/communication/communication.ts`: the ladder, what the sender emits and the seeker hears.
- `packages/core/src/referee/referee.ts`: the referee, who switches the ladder and calls the tag.
- `packages/core/src/sensors/`: what the Bolt reports, the locator and the collisions among it.
