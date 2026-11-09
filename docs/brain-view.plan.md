# Brain view

A tab of the browser app that shows the seeker's connectome as a body seen through a microscope: the brain of a small animal reconstructed cell by cell, lit by what it does while a run goes or a recording plays. The circuit is `packages/core/src/brain/connectome/circuit.json`, the network `network.mjs`, the browser's runner `apps/browser/src/matrix-brain/runner.ts`. The SVG in `agent/brains/` stays the daily drawing until the view replaces it.

## Decisions

- The picture is anatomy, not a graph: cell bodies on a rind, arbors in named neuropils, synapses as contacts, organs for the two layers that are rules. No spheres and sticks.
- Everything about a cell that the wiring can say is derived in the view: its grade, arbor, synapse counts and colours come from `role`, `of`, `gate`, the edges and the weights. `circuit.json` gets one new attribute, `vis`, holding only what the wiring cannot say: the neuropils' places and shapes and the soma positions, in the Bolt's body frame, centimetres, nose along +y.
- The IR receivers are ears. The corner receivers, frame receivers and slot receivers are afferent fibres from the ears, not brain cells.
- Three grades of cell, read from the file and drawn apart: natural, a sum of weighted edges in and a rate out; half natural, the 23 product cells with `of` and `gate`, whose gate is a rule; stand-in, the 3 self neurons with no edges, read by name in the carry and the turn. A natural cell is a full mesh with its synapses. A product cell shows its two dendritic fields with the gate field hollow. A self neuron is a fibre that enters and ends without synapses. The forgetting constants on ring and distance cells are a mark on the soma.
- The observation layer and the motor layer are organs: surface, inputs, outputs and a few readouts. Not poked. The ear carries the clock of the sender's round; the muscle carries the heading arrow and the wheels.
- The view runs on the browser's network only. The rig's `brain.mjs` is the same network, so the picture holds for it too, but the view does not reach it.
- Rendering with three.js, a new dependency of `apps/browser`. One canvas created once and hosted by the route, as the plotter does, so the scene survives route changes.
- No app code is edited while a run or a path is going; the page reloads and the Bolts drop.

## The body

Five neuropils and three organs, placed by `vis`:

- Seven glomeruli, one per IR channel, where the frame and slot fibres of that channel end and the product cells have their first field.
- The ring, a torus of 36 wedge-shaped arbors tiling 10 degrees each, nose at the top.
- The distance column, ten flat layers from near to far, the frame receivers' boutons on them and the product cells' second field.
- The ear nuclei, four small lumps at the corners for the corner receivers' terminals.
- The motor neuropil, below and central, where the steer, search and axis cells collect from the ring and the ring cells' axons end.
- Four ear shells at 45 and 135 degrees either side of the nose; two wheels; the body outline between them with the yaw and the step as small arrows.

Synapses: about ten contacts per unit of weight, excitatory and inhibitory as two marker shapes in two colours. Fibre thickness by summed input.

## Look

The dark field of a fluorescence microscope. Colour has three jobs and no others; everything else is shape, place and material, because the palette validator shows that no fourth hue survives beside blue and red on the dark surface, and six neuropil hues fail every all-pairs check.

| Token | Dark, the view | Light, the SVG | Job |
|---|---|---|---|
| surface | `#1a1a19` | `#fcfcfb` | the field |
| ink | `#f0efec` | `#0b0b0b` | labels, outlines |
| ink muted | `#c3c2b7` | `#52514e` | secondary labels, the resting tissue |
| excite | `#3987e5` | `#2a78d6` | a positive weight, its synapse marker |
| inhibit | `#e66767` | `#e34948` | a negative weight, its synapse marker |
| select | `#199e70` | `#1baf7a` | the selected cell or group, nothing else |

The three hues pass the validator together on both surfaces, with the aqua against red in the CVD warn band, so a selection is always also a change of material: the selected cell at full opacity, the rest dimmed. Blue and red are the SVG's own, so drawing and view agree.

- Tissue is neutral. Neuropils are translucent shells in the muted ink, named by a label at their edge; cells are the muted ink at rest. Place and shape identify a neuropil, not a hue.
- Light is the cell's rate as emissive intensity, 0 dark to 1 bright, through one bloom pass, in the ink colour. A glowing cell is white-hot tissue, as calcium imaging shows it. A synapse flashes in its own colour, excite or inhibit, by the presynaptic rate times the weight.
- Grade is material. Natural cells are solid. Product cells are solid with the gate field as a wireframe. Stand-in cells are a dashed fibre in the muted ink and never glow white, only brighten in grey. Organs are the same translucent shell as neuropils with their readouts in ink.
- Held cells, in the poke mode, carry a ring of the ink colour around the soma. No fourth hue.
- Type is the app's mono class, as the tab links; labels in ink, values in muted ink, never in a series colour.
- Few materials: one per grade, one for shells, two for synapse markers, one for fibres. Every mesh is generated from the wiring, none is made by hand, so the look is consistent by construction.

## Light

A cell's arbor glows by its rate; frame and slot fibres by their count; the self fibres by their value against a scale of their own, 90 degrees and 20 cm as full. A synapse flashes with its presynaptic cell's rate times its weight. The ear shells flash on every raw notify and mark every corner read, landed or not. The round dial on the ear turns with the sender's schedule, its seven marks lit for a heard frame, dark for a slot gone silent, the volley a tick before the expected moment. The heading arrow on the body is the commanded heading, its length the speed, the motor mode as a label, and each roll fired is a pulse down it.

## Modes

- Live: the runner's network, a step listener on `MatrixBrain` handing the network to the view after each step; the view redraws at the screen's rate from the latest arrays.
- Replay: a recorded run from the browser's session store or a dropped file, stepped through the same network by the bench's logic from `experiments/replay-network.mjs`, with a time slider and pause. Works without Bolts. The source building runs in Node today and needs to run in the browser too.
- Poke: holds on neurons, see editing. The poke mode drives the motors: a hold on M_RIGHT turns the Bolt right for one volley's rolls, the nudge a kid feels. The matrix-only mode is for watching, not poking.

## Interaction

- Orbit, pan, zoom; home returns to nose up from above and behind; presets from above, from the ear side, into the ring along the nose.
- Select a cell by click or from a list: id, role, grade, angle or band, constants, ladder and strength; incoming and outgoing as lists of partner, weight and contribution, weight times rate, sorted by contribution. The selection stays lit, the rest dims.
- Select a group, the roles: a group's rates as one row, the ring as a polar plot, the distance as bars.
- Editing, with a `hold` map in `network.mjs` applied after the step's arithmetic and before the evidence update, and the circuit reloaded on reset: a weight by slider on a selected contact; a cell paused at 0; a cell fired at 1 or pulsed for a step. Every hold drops when a run starts.
- The leash: a roll stops when it is not repeated, so a hold on a motor cell lasts one volley's rolls and drops by itself, a nudge per poke; a hold on a sense or belief cell stays until released and moves the Bolt only through the brain, under the mode's speed cap and the runaway limit. How long a Bolt rolls on after its last roll is not measured yet and is measured first.

## Steps

1. `vis` into `circuit.json` from `build-circuit.mjs`: the neuropils, organs and soma positions in the body frame. The SVG may use them. No new dependency.
2. The step listener on `MatrixBrain`.
3. three.js, the `/brain` route, the canvas for the page's life, the body and the neuropils from `vis`, the cells generated from the wiring, lit live. Navigate, home, select a cell.
4. The organs: the ear shells with the dial, the heading arrow and wheels, the body arrows for yaw and step.
5. Replay with the slider.
6. The hold map, the leash, the coast measurement, editing.

Steps 1 to 3 are a session. The brain work of the handover does not depend on any of them.

## Open

Both wait for the user's word after a first look at the view.

- The scale of a synapse count and the exact shapes of the two markers.
- Whether the glomeruli sit by ladder, long and short apart, or by strength in one row.
