---
title: Process
purpose: How the seeker's brain is built, from a rule in code to measured weights to neurons, with the floor as the judge
checked: 185c1c7
---

# Process

How an insect's brain is built for a Bolt: the loop from a rule written as code, over runs on the floor and tables counted from them, to weights and at last to neurons, and round again. The brain is `packages/core/src/brain/connectome`: `circuit.json` holds the neurons and edges, `build-circuit.mjs` derives every weight from `senses.json`, `network.mjs` runs it, `experiments/replay.mjs` is the bench. The floor is the judge at every turn; the bench proposes, the user decides.

## 1 A rule first, as code

A behaviour whose mechanism is not yet clear is written as a plain rule in code. The carry of the belief along a step and the yaw shift of the ring are at this stage, in `network.mjs`, driven by the self neurons. A rule is quick to change and easy to read in a trace. Its job is to state what the brain must do, not how a neuron does it.

## 2 The floor run

Two Bolts in the room, the sender's place known, every frame, corner read, send and motion sample recorded in the session. The run is the only evidence. A run that ends without an error is marked, failures included, because the failures are the data: a pass with the belief pinned ahead says more than a find. The code is not edited while a run or a path is going; the page reloads and the Bolts drop.

## 3 The tables

What the senses did is counted against the truth: frames per channel by sector and by distance band, landed reads per corner, the exposure per ladder the sender was sending, from its logged sends. `replay.mjs --senses --write` writes the counts into `senses.json`. No weight is set by hand. A sector or band with too little exposure gives no weight, a band with too few frames no neuron, so the brain says nothing where it has not listened.

## 4 Weights from the tables

`build-circuit.mjs` turns the counts into edges, the log of a rate over its mean, and writes `circuit.json`. The bench replays every recorded run through the new circuit and scores the belief against the truth second by second. A change that scores worse on the recordings does not go to the floor. Constants the tables cannot give, the forgetting of the ring and of the distance, the corner gain, are scanned on the bench and chosen by the user.

## 5 Back to the floor

The bench runs on old frames and cannot see a pass that never happened or a turn the seeker never made. A brain that passes the bench gets a live seek, and the live seek is the judgement, watched by eye. Every live run goes back into step 2.

## 6 Rule into neurons

Once the behaviour is stable, a rule becomes a population with weights, the rule as the specification and the bench as the check that nothing moved. The frame receivers, the ring and the distance bands went this way: the imprint rules became receivers and evidence neurons. The shifts are next: the yaw as two rotation populations gated by the turn's direction, the parallax and the slide as populations gated by the distance and bearing belief too, the forgetting as an inhibitory population driven by travel. Rotation neurons shift the ring in whole steps where the rule turns by fractions of a degree; the bench shows the cost, and a finer ring is the answer if there is one.

The drawings follow the file. `vis` in `circuit.json` is written by the builder, the SVG is drawn by `agent/pull.sh` after every pull, the brain view derives every cell from the circuit at load (`docs/brain-view.plan.md`). The one time a hand touches them is here: a new kind of cell gets its place in `vis` and its grade and material in the view in the same commit as its weights.

## 7 Round again

New neurons change what the senses need to measure, so the tables grow with them: the product neurons by distance band needed exposure near, and a path was driven round the sender at 30 and 55 cm to fill the bands. Step 2 follows.

## Constraints

- Everything incoming goes through the observation layer, the brain processes, the motors are driven. No layer reaches past another.
- A fired write can fail silently. Anything vital, the listen's re-arm above all, has a watchdog.
- The bench scores, the user decides. A constant is never set by the bench alone.
- Measurements go to the commit message, not to the docs.
