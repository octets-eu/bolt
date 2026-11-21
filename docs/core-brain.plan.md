# Core brain plan

**Backlog 01 of `docs/hide-and-seek.plan.md`.** The seeker's brain as the package `@bolt/brain`, its connectome built from `circuit.json` alone.

## Goals

1. **@bolt/brain is a package.** It lives in `packages/brain/`, is written in strict TypeScript and shipped as source like `@bolt/protocol`, and depends on `@bolt/core`; the app, the bench and the builder use it.
2. **circuit.json is the connectome.** Neurons, edges, populations, the ports to the observation layer and the motor, and the constants of all three layers are data. The network code knows a short list of cell models, synapse kinds and population operators, and no neuron names. The operators are a step on the way: at the end every mechanism is cells and edges.
3. **Observation and motor are code behind interfaces.** The observation layer turns the Bolt's streams into input ports, the motor turns output ports into a roll; nothing crosses by a neuron's name.

The weights of the senses onto the belief are drawn by hand: the four corner lobes first (W0), the long levels with the new ladder and the bands to 4 m (U), the short ladder's and the far redraw in phase W. Until W1 the short ladder's profiles are the builder's from `senses.json`. Phase C changes no weight. The edges the steps add (C3's and D1 to D5's) are structural: their weights follow from the mechanism and are not drawn.

## Rules for every step

- One step, one commit; its check and the bench's numbers go in the commit message.
- Every step runs the bench before and after, `node bench/run.mjs`, the same set before and after. Until F5 the set is the scored runs on the old ladder; from F5 on it is the reference runs, and the seeks of L1 to L3 and S2 join it from the next step on; the reference of phase D is re-run on the set as it grows.
- Phases A to C change no behaviour. The replay prints per run two digests, 32-bit FNV-1a over one line per event: the estimate digest over every network step, `t angle length distance` at six decimals; the motor digest, from B1 on, over every motor call, `t mode heading speed` at six decimals. Equal digests pass, nothing less does. A rebuilt `circuit.json` is byte-identical to the committed one.
- R4, F1, U and M1 change behaviour: R4 by the ladder, judged with the Bolts standing; F1 by the read schedule, judged on F4's run; U by the weights, the bands and the near rule, judged by the bench against F5's numbers; M1 by the motor alone, judged on the Bolts. B3 leaves the estimate digest equal.
- Phase W changes behaviour by the weights and the bands alone; the bench judges, each step's check names its runs and its reference.
- Phase S changes behaviour in one variant, `"beat"`, judged by S2's A/B; the bench's numbers for it are reported, not bounded.
- Phase D changes behaviour, in small deviations, each step against W2's numbers, the brain entering D, on the same runs, not against the step before: the share of seconds under 30° within ±3 points, the mean error within ±5°, no run over 40 s with its share of seconds under 30° more than 10 points down (on a 24 s run 10 points are two seconds). A step outside the bounds is not committed: it is debugged, or its cell form changed, until it is inside.
- The old code in `packages/core/src/brain/` and `packages/core/src/experiments/replay.mjs`, `replay-network.mjs` stays untouched until E1; its `circuit.json` is a copy of the package's while both are scheme 1, so the reference runs the same weights. The package starts as a copy; `OLD=1` makes the package's replay import the old modules, `Date.now` patched onto the replay's clock for the old motor as `performance.now` is for the old observation; the old motor's timers are module state (`motor.mjs:54`), so the reference imports it afresh for every run, a query on the import's URL. From R4 on the old modules no longer run what the package runs, holding neither the new ladder nor F1's schedule: `OLD=1` is the reference up to B2 and leaves the bench with F5, and the old `circuit.json` is no longer rewritten. The old code itself stays until E1.
- The brain tab is backlog 02's (`docs/hide-and-seek.plan.md`): it compiles against the package, nothing more is checked. It grows its anatomy on its first visit (`view.ts:34`), so a cell it cannot place breaks the tab and nothing else; D's new cells get their place there.
- Live runs with the Bolts, L1 to L3 and the A/B runs of S2, go where the bench is blind: the bundle on the rig, the link, the clock, the motor and the closed loop. Each run is marked and extracted into the bench. L1 is the live baseline; phase D's reference on the bench is W2.

## Interfaces

```ts
// --- observation: the Bolt's streams into input ports, a value per port per tick
type Corner = 'FL' | 'FR' | 'BR' | 'BL';
type InputPort =
  | `frame.ch${number}` | `slot.ch${number}` | `corner.${Corner}`
  | 'frame.any' | 'frame.carrier' | 'frame.miss' | 'frame.closeness' | 'carrier.down' | 'carrier.up'
  | 'ladder.near' | 'ladder.settled'
  | 'self.turned' | 'self.fwd' | 'self.right' | 'self.still' | 'self.forward';
// every port is computed each tick, bound or not; today no cell reads frame.carrier, frame.miss,
// frame.closeness, carrier.down, carrier.up, ladder.settled, self.still or self.forward
type Sources = Partial<Record<InputPort, number>>;
interface Motion { heading: number; x: number; y: number }   // heading clockwise from the locator's +y, deg; locator, cm
interface Clock { now (): number }

class Observation {
  constructor (bolt: Pick<Bolt, 'sensors' | 'queue'>, config: Circuit['observation'], clock?: Clock);   // the construction and `start` each count as a ladder switch
  start (): Promise<void>;
  stop (): Promise<void>;
  onNotify (channel: number): void;       // the replay feeds these two
  onRead (payload: number[]): void;
  tick (motion: Motion, efference: number): Sources;
  readonly timed: boolean;                // the frames' beat is learned
  readonly channels: ReadonlyMap<number, { range: string; strength: number }>;
  readonly carrier: number | null;        // the state line and the trace read these three
  readonly near: boolean;
  readonly stats: { frames: number; reads: number; landed: number; named: number; flooded: number; misses: number; bunched: number; rearmed: number };
  afterVolley?: () => void;
}

// --- network: circuit.json running
class Network {
  constructor (circuit: Circuit);         // checkCircuit first; every potential 0, every rate normalised from that
  step (sources: Sources, dtMs: number): void;
  output (port: OutputPort): number;
  estimate (): { angle: number; length: number; distance?: number };   // from the readouts
  population (name: string): Float64Array;   // its cells' rates in the file's order: the matrix picture, the state line's vector, the views
  rate (id: string): number;              // for the views
}

// --- motor: output ports into a roll
type OutputPort =
  | 'steer.fwd' | 'steer.back' | 'steer.right' | 'steer.left'
  | 'mode.search' | 'mode.roam' | 'mode.axis' | 'mode.near'
  | 'request.short';                      // read by the referee, not the motor
interface Roll { mode: 'target' | 'listen' | 'probe' | 'scan' | 'roam'; dir: number | null; heading: number; speed: number }

class Motor {
  constructor (config: Circuit['motor']);   // its own state: the listen's and the scan's timers
  command (out: (port: OutputPort) => number, heading: number, commanded: number, dtMs: number, now: number): Roll;   // `now` from the caller's clock: the app's Date.now, the replay's
}
function fireRoll (bolt: Bolt, speed: number, heading: number): Promise<void>;
```

`ringVector` (`ring.ts`) stays what the state line and the trace print, the population vector over `population('ring')`; `estimate` is the bench's.

## circuit.json, scheme 2

```jsonc
{
  "scheme": 2,
  "about": "…",
  "observation": { "channels": { "0": ["long", 2], … }, "beatMs": 200, "repeat": 1, "expectMs": 3000,
                   "volley": { … }, "carrier": { … }, "near": { … }, "settleMs": 3000,
                   "slots": { "mode": "late", "marginMs": 40 }, … },
  "motor": { "seekSpeed": 32, "probeSpeed": 28, "listenMs": 2500, … },
  "neurons": [
    { "id": "IR_FL",     "model": "input", "port": "corner.FL", "gain": 3, "role": "corner", "angle": -45 },
    { "id": "IR_ANY",    "model": "input", "port": "frame.any", "rateTauMs": 3000, "role": "presence" },
    { "id": "SELF_TURN", "model": "input", "port": "self.turned", "role": "self" },
    { "id": "R00",       "model": "evidence", "population": "ring", "angle": 0, "tauParallax": 1, "role": "ring" },
    { "id": "D00",       "model": "evidence", "population": "distance", "cm": [0, 20], "tauCm": 30, "role": "distance" },
    { "id": "IR_CH0_B0", "model": "product", "role": "gated" },
    { "id": "M_SEARCH",  "model": "relu", "bias": 1, "role": "search" }
  ],
  "edges": [ ["IR_FL", "R00", 0.371], ["IR_CH0", "IR_CH0_B0", 1], ["D00", "IR_CH0_B0", 1, "gate"] ],
  "populations": {
    "ring":     { "normalize": "peak", "decode": "peak", "shift": { "by": "SELF_TURN" },
                  "carry":  { "fwd": "SELF_FWD", "right": "SELF_RIGHT", "distance": "distance", "minCm": 0.2 },
                  "forget": { "fwd": "SELF_FWD", "right": "SELF_RIGHT", "distance": "distance", "minCm": 0.2, "floorCm": 7 } },
    "distance": { "normalize": "peak", "decode": "mean",
                  "carry":  { "fwd": "SELF_FWD", "right": "SELF_RIGHT", "bearing": "ring", "minCm": 0.2, "minShift": 0.02 },
                  "forget": { "fwd": "SELF_FWD", "right": "SELF_RIGHT", "minCm": 0.2 } }
  },
  "outputs": { "steer.fwd": "M_FWD", "steer.back": "M_BACK", "steer.right": "M_RIGHT", "steer.left": "M_LEFT",
               "mode.search": "M_SEARCH", "mode.roam": "M_ROAM", "mode.axis": "M_AXIS", "mode.near": "IR_NEAR",
               "request.short": "REQ_SHORT" },
  "readouts": { "bearing": "ring", "distance": "distance" },
  "vis": { … }
}
```

- The network reads `model`, `population`, `port` and the model's parameters, never `role`, `type`, `side` or `pos`; those are for the views. This holds from C2 on; C1 still finds the self cells by `role` and `axis`.
- Cell models: `input`, the port's value times `gain`, with `rateTauMs` its events per second smoothed; `relu`, max(0, bias + input); `evidence`, its input added to its potential, the log-evidence, its rate from its population's normalisation; `product`, its add input times the share of its gate inputs in their population (until D1). The leaky cell (`tauMs`) and the old map's ops `mul`, `sub`, `clamp` and `adapt` get no model: nothing in the circuit uses them.
- An edge `[pre, post, weight]` adds weight times the pre's rate; a fourth field names another kind. `gate` multiplies: the cell's rate is its add input times the sum of its gate inputs, weight times rate; for a `product` cell that sum is divided by the total of the gates' population, the share, which `peak` normalisation keeps above 0. Until C1 the file keeps the worm's fourth field, the type 0; C1 drops it, the edges three fields, `types.ts`'s edge tuple following; from C3 a fourth field names a kind.
- A step updates in a fixed order of models: inputs, products, the population operators in the order `carry` (the ring's turn, then the stack's slide, both from the readouts taken before either), `forget`, `shift`; then evidence and normalisation, then relu cells in the file's order.
- A population has `normalize` (`peak`: exp of the potential less the population's peak), `decode` (`peak`: the `angle` of the highest rate, with `length` 1 over the sum of the rates, the peak's share of the mass; `mean`: the rate-weighted mean of the cells' `cm` midpoints) and operators: `shift` by a cell's value in degrees; `carry` on a ring turns it by the parallax of the step at the believed distance, on a stack slides it by the step along the believed bearing, in bands, under `minCm` of step not at all and the slide not under `minShift` of a band; `forget` with the travel over `minCm`, by each cell's `tauCm` in cm or `tauParallax` in radians of the step over the believed distance floored at `floorCm`.
- `outputs` names the neuron behind each output port, `readouts` the populations behind the estimate.
- `observation`, `motor` and the operators hold the constants of the three layers, `vis` the brain view's anatomy. The builder's constants (the corner angles, N, the bands, the profiles' thresholds) stay in the builder and come out as the cells' fields.
- `checkCircuit` at load: ids unique; every edge, output, readout and operator names a neuron or population that exists; every port and model is known; every `OutputPort` the motor and the referee read is in `outputs`; every bound input port is one the observation produces; every `evidence` cell names a population.
- Once phase C is done, the scheme is described in the header of `packages/brain/src/types.ts` and this section points there.

## Steps

### L0, far data for the bench (**done**)

The starts are the plotter's reference points (`plotter.ts`, `floor-plan.svg`): a Bolt reset on a point knows its place, the truth carries no drive out. The three distances of this plan: Sender/blue on rg and Seeker/green on u1, 1.2 m; Sender/blue on d1 and Seeker/green on u1, 2.4 m; Sender/blue on d1 and Seeker/green on u2, 3.2 m. L1 and S2 use them.

- **L0** at each distance a path, Seeker/green standing on its point facing four headings 8 s each, the truth on its start line, and a seek, marked; extracted into the bench as runs 18 to 23. A seek starts where Seeker/green stands, its time limit and runaway fence `SEEK_DEFAULTS` in `matrix-brain/index.ts` or what `Seek.start` was given. Runs 18 to 23 retire with the old ladder at F5; the three starts stay.

### A, the package (behaviour identical)

- **A1** the move: `packages/brain/` as `@bolt/brain`: `package.json` (exports `.`, `./circuit.json`, `./sensory_map.jsonc` until B2, and `./load` for Node only); network, observation, motor, ring, ladder and load copied as they are, an `index` exporting what the app and the bench import (`Network`, `parseJsonc`, `Observation`, `ringVector`, `LadderSender`, `motorCommand`, `fireRoll`, `MOTOR`), `circuit.json` and `sensory_map.jsonc` beside them; `replay.mjs` and `replay-network.mjs` copied from the experiments into the root `bench/`, beside `run.mjs`, `extract.mjs` and the runs, importing the package, with the digests and the per-run share of seconds under 30°; `bench/run.mjs` runs them, `OLD=1` the old modules. `ladder` is the sender's side, kept in the package as the referee's tool until core's `sendLadder` holds a code for two beats (not in this plan). Check: digests equal with and without `OLD=1`.
- **A2** the types: the seven modules as strict TypeScript; `tsconfig.json` as core's plus `"types": ["node"]` and `@types/node` for `load.ts`, the one module that imports `node:`; `types.ts` with the view's `Circuit`, `NeuronDef` and `Vis`. Check: tsc strict, digests equal.
- **A3** the builder: `build-circuit` and `vis` into `packages/brain/build/` as strict TypeScript, the package's `tsconfig.json` covering `build/` beside `src/`, run by `tsx`, with `senses.json`. Check: tsc strict, the rebuilt `circuit.json` is byte-identical.
- **A4** the app on `@bolt/brain`: `runner.ts`, `connectome.ts` (`@bolt/brain/circuit.json`), `view.ts`, `anatomy.ts`. Check: the app type-checks and builds, digests equal.

### B, the interfaces (behaviour identical)

- **B1** output ports: `outputs` in `circuit.json` and `Network.output`; the motor a class with its own state, `now` passed to `command`, reading ports only (`mode.near` instead of IR_NEAR); the referee reads `request.short`. The replay calls `command` once a second, after the step that crosses the second: `heading` the last motion sample's, `commanded` the motor's own last heading (the first sample's to start), `dtMs` since the last call capped at 400 as live, `now` the replay's clock; the old motor under `OLD=1` is called the same way. The replay prints the motor digest. Check: digests equal.
- **B2** input ports: the input neurons carry `port`, `gain` and `rateTauMs`; `sensory_map.jsonc`'s channels dissolve into them; its `ir` block becomes `observation`, less `corners`, which is the builder's, plus the layer's constants now in code (the 100 ms second-notify window, the follow's 40 ms and 0.4, `expectMs`, the 3 s a channel stays expected, the watchdog's 1500 ms, the fired command's 300 ms); `motor.mjs`'s `MOTOR` becomes `motor`; the observation layer takes its clock, stamps the construction and `start` as ladder switches, and the replay's poke of `switchedAt` goes; `sensory_map.jsonc` leaves the package. Check: digests equal, the rebuild byte-identical.
### R, the ladder to 4 m (the Bolts standing)

The long ladder is chosen before the brain's far weights: which levels arrive is the brain's cue for distance. The recorded runs carry the old ladder and retire with it (F).

- **R1** (**done**) code 7: sent, acked and heard as 7 in both directions, Sender/blue to Seeker/green and back: the ladders have eight codes, seven in use.
- **R2** (**done**) the ladder: eight strengths, 2 to 255, one per code in a round of one beat each, measured with both Bolts placed by hand and standing at 1, 2, 3 and 4 m, the listener on four headings, in both directions: frames per strength, and corner reads fired, acked and hit. The user's pick: long 4, 8, 16, 128 on codes 0 to 3; the short ladder as it is, code 7 unused.
- **R3** (**done**) the ladder in one place: the builder takes its `channels` from core's `LADDERS`, its own copy gone; the near rule's level and the closeness' reference strength are constants of the `observation` block, no strength written in `observation.ts`; the brain tab places its channels by their count; R2's standing measurement is kept as `Survey.ladder` in the app's survey code, its count in `bench/`. Check: with the old ladder still in `LADDERS`, the estimate and motor digests equal on the bench, and the rebuilt `circuit.json` differs by the two new constants alone.
- **R4** (**done**) the pick applied: `LADDERS.long` sends 4, 8, 16, 128; `docs/bolt-reference.md` follows. From here the recorded runs no longer match what is sent, and the near rule stays silent until U2. Check: a standing pass with `Survey.ladder` at 1 and 4 m on the ladder as sent, the levels arriving as in R2.

### F, the reference run (the bench's new ground)

The bench's run is the coil: Sender/blue on d1, Seeker/green from u2, a spiral out round u2, loops creeping down the line to d1 as wide as the floor allows, a last spiral round the sender. It covers 20 to 365 cm on the line of sight and shows the sender every side of the seeker at every distance. Its truth is the camera's track. `bench/ref/coil/target.png` is the path.

- **F1** (**done**) the read schedule: the last heard channel stays expected for 10 s, the others 3 s as today (`observation.ts`, `nextVolley`). Check: the bench's numbers before and after go in the commit message.
- **F2** (**done**) the coil: a behavior in core beside `archimedean`, the radius given to it per step, the room's widths in the app's survey code, a roll every 280 ms. Check: the dry run's track lies on `target.png`.
- **F3** (**done**) the track beyond the camera's top edge: `bench/camtrack.mjs` bridges it by the locator between the camera's points. Check: on `ref/archimedean`, a stretch of the camera's track left out and bridged lies within the distance camera and locator are apart on that run.
- **F4** (**done**) the run: the coil driven on R2's ladder, kept as `bench/ref/coil` with the session's cut, the track and the image. Check: frames a second and corner reads hit by distance from the sender go in the commit message.
- **F5** (**done**) the bench on it: `replay.mjs` scores a reference run against its `track.tsv`, `run.mjs` runs the reference runs and the marked seeks of the store. The replay leaves a sense out on request, `--without corners`, `frames` or `slots`, so one run judges each sense's weights alone. Bench runs 1 to 34, `index.tsv` and `ref/archimedean` move to `archive/bench/`; `OLD=1` and the old motor's reference leave the bench. Check: `node bench/run.mjs` scores `ref/coil`; its numbers are the reference of the steps that follow.

### U, the brain on the new ladder (the bench judges)

The minimum that makes the present brain run on R2's ladder. The full drawing by hand is W, after C.

- **U1** (**done**) the levels and the bands: the builder's `channels` as R2's ladder; the distance bands to 4 m (today 10 of 20 cm to 2 m); the long levels' frames and silences onto ring and distance drawn by hand, `senses.json` counting the old strengths; the short ladder's profiles and the corner lobes as they are; the brain tab's places for the channels. Check: on `ref/coil` the share of seconds under 30° and the mean error both better than F5's, with the corner reads and without them.
- **U2** (**done**) the near rule: which level of R2's ladder, heard `minFrames` times in `windowMs`, asks for the short ladder; today it is the long ladder's weakest. Check: on `ref/coil` the rule is on inside the distance the user sets and off beyond it.

### L1, the live baseline

- **L1** (**done**) three seeks on the Bolts from the three starts of L0, on R2's ladder with U's brain, each marked and extracted into the bench beside the reference run. L1 checks what the bench cannot see: the bundle on the rig, the link, the clock, the motor in the loop. It is the live baseline. A seeker that loses the line of sight drives on blind, its rolls tied to volleys (M1); such a seek is stopped by the user, stays unmarked and is repeated.

### C, the generic network (behaviour identical)

- **C1** (**done**) models and populations: `model`, `population`, `populations` with `normalize` and `decode`, `readouts`, the edges three fields; the network dispatches on them, the self cells still found by `role` and `axis`; `checkCircuit`. Check: digests equal, the rebuild byte-identical.
- **C2** (**done**) the operators as data: `shift`, `carry` and `forget` declared on the populations with their cells and constants; `role` is not read from here on. Check: as C1.
- **C3** (**done**) the product cells as edges: `model: "product"`; `of` and `gate` become an add edge and gate edges; the brain view's grade reads `model` instead of `of`, so it compiles. Check: as C1. The stash `corner lobes drawn` is dropped: its lobes are W0's.

### W, the weights by hand (the bench judges)

The profiles of the senses onto the ring and the distance are drawn by hand from the body and scored on the bench. U drew the long levels'; the short ladder's still come from `senses.json`, the counted tables of the retired runs, read by the builder alone.

- **W0** before B1, the corner lobes: each corner's profile onto the ring drawn as G·max(0, cos(θ − corner))^n at the receiver's angle (`CORNER_G`, `CORNER_N` in the builder), the frames' and silences' profiles as counted until W1; the old copy of `circuit.json` rewritten with it. Check: the bench's side within ±5°, share and mean |err| better than the counted circuit's; `OLD=1` byte-identical.
- **W1** the short weights: the short ladder's frames and silences drawn by hand over every band; `senses.json` goes, with the builder's mention of its writer. Its runs: the coil's last spiral round the sender driven on the short ladder, kept as `bench/ref/near`, and L1's seeks. Check: on those runs the share of seconds under 30° and the mean error both better than before W1; `ref/coil` reported.
- **W2** after S2, before D1, the far weights: the long levels' profiles and the bands redrawn over `ref/coil` and the far seeks the bench holds by then, L1's and S2's. Check: beyond 2 m from the sender the two numbers better than W1's; inside 2 m within phase D's bounds against W1.

### S, the silent slots at their beat (A/B with the Bolts)

Today a silent slot is booked when the next frame arrives, at the nose of that moment, and a gap of more than two rounds books nothing. Booked at its own beat, the shift and the carry correct it like any frame, and a long gap counts. Silences count moving or standing, as today.

- **S1** the variant: `observation.slots.mode` is `"late"` (today) or `"beat"`: a slot booked once a channel's expected frame plus `marginMs` (40 to start, the follow's window) has passed without a notify, on the channels of the current ladder the read schedule still expects (F1); a channel unheard longer books nothing until it is heard again. The bench replays both on every run; the brain tab picks the variant per seek, and the seek's line logs it. Check: `"late"` gives the digests of the step before; the bench's numbers for `"beat"` go in the commit message.
- **S2** the A/B runs: three pairs of seeks, `"late"` and `"beat"` from the three starts of L0, marked and extracted into the bench; more pairs while the eye cannot tell, the agent running them from the sixth pair on, its tools re-visited and tested first. The user judges by eye, the bench adds its numbers; the winner stays, the other variant is removed.

### D, mechanisms found in nature (small deviations)

Each step replaces one operator by cells and edges and is shown in full before it starts. The cell forms are from general neuroscience, not measured. Each step names what it retires from the scheme; after D5 `populations` holds `decode` only. D1 and D3 are expected to leave the estimate digest equal, a sum and a held mean being invisible to a softmax; the bounds are for D2, D4 and D5.

| Step | Today | The cell form | The scheme gains and loses |
|---|---|---|---|
| D1 | a product cell | a relu cell with gate synapses, the distance population normalised to a sum of 1; expected identical: the distance cells feed only the gates and the mean, both scale-free | gains `normalize: "sum"`; loses `product` |
| D2 | forgetting with the travel | shunting inhibition: the potential divided by 1 + the input of a travel cell, the port `self.step` through a `shunt` synapse; for `tauParallax` a parallax cell, the step gated by the distance population through weights 1 over each band's midpoint floored at `floorCm` | gains the port `self.step`, the kind `shunt`; loses `forget`, `tauCm`, `tauParallax` |
| D3 | the softmax | divisive normalisation: the evidence cells fire exp of their potential, a pool cell sums the population and shunts it; the potential is bounded as a membrane is: the pool holds the population's mean potential at 0 through `graded` synapses, and each potential saturates at ±`clip`, set above the largest spread the bench's runs reach, which the check prints, so the digest stays equal | gains the kind `graded`, a synapse passing the pre's potential, not its rate, as the graded synapses of non-spiking cells, and `clip` on the evidence model; loses `normalize` |
| D4 | the shift by the yaw | shift cells, as the fly's P-EN cells: a clockwise and a counter-clockwise copy of the ring one cell over, `graded`, gated by the turn's two signs; a turn of more than one cell in a tick is clipped to one, the check counts the clipped ticks over the bench | loses `shift` |
| D5 | the carry | the same shift cells, gated by the step over the believed distance, each cell by its own angle instead of the whole ring by the peak's; the step along the bearing as a cell, the ring's rates through weights cos and sin of each angle gated by the fwd and right cells, which gates the stack's shift cells up and down | loses `carry` |

- **L2** after D3: the ring's rates change scale, and with them the motor's choice between target, axis and search. The motor digest shows the change; only the Bolts show whether it is better.
- **L3** after D5: the current goal's test, 0.5 to 3.5 m.

### B3 and M1, the link and the silence (with the Bolts)

One Bluetooth link per Bolt carries its rolls, its corner reads, the listen's re-arm, the motion stream and every ack; infrared goes first. Today each drive keeps to that by its own care, and the brain rolls only after a volley, so silence stops the rolls. The two steps stand behind L3: the current goal's seeks keep the line of sight, and M1's check is a seek that loses it.

- **B3** the link gate: the observation layer owns the link's timetable and answers whether the link is free; the motor rolls on its own clock and yields to a volley; core's command queue holds the same gate, so every drive obeys it without knowing who reserved the link. Check: the estimate digest equal; on the Bolts, the share of corner reads without an ack not above L1's.
- **M1** the motor's answer to silence: the motor is asked on B3's clock with or without frames; what it does without them is the circuit's, cells reading the belief and its length, shown in full before the step starts. Check: on the Bolts, a seek from 2.4 m that loses the line of sight behind the partition does not drive on at its last command.

### E, the end

- **E1** the old code: `packages/core/src/brain/connectome/`, `utils/ladder.mjs`, `experiments/replay.mjs` and `replay-network.mjs` retired; `seek.mjs`, `utils/link-load.mjs` and `agent/pull.sh`, which import or read them, go with the Open item.
- **E2** the docs: the scheme in the header of `types.ts`; `bolt-reference.md` (the ladder's timing names `brain/utils/ladder.mjs`), `brain-view.plan.md` (circuit.json, network.mjs, vis.mjs, replay-network.mjs) and `communication.ts`'s header (sensory_map.jsonc) pointing at the package; this plan closed. `hide-and-seek.md` names no code and stays.

## Open

- The agent's `brain.mjs`, `seek.mjs`, `utils/link-load.mjs` and `pull.sh` onto the package or left, and `packages/brain` in `agent/sync.rules`: at E1.
- A seek from 2.4 m with the line of sight free heard frames and none of its corner reads hit, the reads timed as in seeks that hit (bench run 31, retired). Not explained; F4's run shows whether it recurs.
- With Seeker/green standing at 2.4 and 3.2 m and no rolls at all, 7 to 11 % of the corner reads fired get no ack (bench runs 20 and 22, retired). Not explained; R2 counts the acks again.
- With one code sent every 200 ms, frames are lost in blocks: a block whose notify follows the send by about 40 ms loses a fifth to a third of its frames, whatever the code; blocks with another delay lose none. Not explained; R2's counts per level are taken over several blocks until it is.
- On the long ladder alone the belief is too far and left of the truth inside 120 cm: its four levels arrive alike inside 80 cm, so nothing in it says how near. The reference runs hold no short ladder; U2 and `ref/near` are its judges.
- In L1's three seeks the believed distance does not fall steadily on the approach: after the short ladder is asked for it rises again and stays there until shortly before the tag. Not explained; the short ladder's weights are W1's.
- Code 7 loses a quarter of its frames at 4 m, in both directions, where the codes beside it lose few; whether it is the code or its place in the round, before code 0, is not separated. The ladders do not use it.
- Seeker/green's frames reach about one level less far than Sender/blue's at every distance of R2; the ladder is picked with Sender/blue sending.
