# Bolt with an insect's brain challenge

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

an example of the file format, the worm's circuit and sensory map, is in `examples/worm/` (see its README; the worm is a different animal, the format is the point)

## Success criteria

- efficient and readable code
- natural observed behaviour of seeker (roaming or targeted or colliding)
- time from start to collision with sender, under 30secs per meter distance

### Extra points for:

- The matrix visualizes the seeker state, eg the ring, in realtime
- Minimal token usage, keep track, ceiling is 30€.


## Constraints

- do not use too much force for driving the bolts, they have some weight and can destroy things.

- do not touch folders:
  - (insert)

- use only folders
  packages/core/src/brain/*
    brain/docs - for handover, notes, ledger, etc
    brain/utils
    brain/connectome
    brain/connectome/motor
    brain/connectome/ring
    brain/connectome/observation


