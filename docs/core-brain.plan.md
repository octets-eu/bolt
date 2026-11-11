# Core brain plan

**Backlog 01 of `docs/hide-and-seek.plan.md`.** The seeker's brain as the package `@bolt/brain`, its connectome built from `circuit.json` alone.

## Goals

1. **@bolt/brain is a package.** It lives in `packages/brain/`, is written in strict TypeScript and shipped as source like `@bolt/protocol`, and depends on `@bolt/core`; the app, the bench and the builder use it.
2. **circuit.json is the connectome.** Neurons, edges, populations, the ports to the observation layer and the motor, and the constants of all three layers are data. The network code knows a short list of cell models, synapse kinds and population operators, and no neuron names. The operators are a step on the way: at the end every mechanism is cells and edges.
3. **Observation and motor are code behind interfaces.** The observation layer turns the Bolt's streams into input ports, the motor turns output ports into a roll; nothing crosses by a neuron's name.

The weights of the senses onto the belief, the profiles the builder draws from `senses.json`, are out of scope: they stay as the builder makes them and are drawn anew after this plan. The edges the steps add (C3's add and gate edges at 1, D2's and D5's) are structural: their weights follow from the mechanism and are not drawn.

## Rules for every step

- One step, one commit; its check and the bench's numbers go in the commit message.
- Every step runs the bench before and after, `node bench/run.mjs`, all scored runs, the same set before and after. Runs added by L0 to L3 and S2 join the set from the next step on; phase D's reference is re-run on the grown set.
- Phases A to C change no behaviour. The replay prints per run two digests, 32-bit FNV-1a over one line per event: the estimate digest over every network step, `t angle length distance` at six decimals; the motor digest, from B1 on, over every motor call, `t mode heading speed` at six decimals. Equal digests pass, nothing less does. A rebuilt `circuit.json` is byte-identical to the committed one.
- Phase S changes behaviour in one variant, `"beat"`, judged by S2's A/B; the bench's numbers for it are reported, not bounded.
- Phase D changes behaviour, in small deviations, each step against C3's numbers as S2 leaves them, on the same runs, not against the step before: the share of seconds under 30° within ±3 points, the mean error within ±5°, no run over 40 s with its share of seconds under 30° more than 10 points down (on a 24 s run 10 points are two seconds). A step outside the bounds is not committed: it is debugged, or its cell form changed, until it is inside. Weights are adjusted after the plan.
- The old code in `packages/core/src/brain/` and `packages/core/src/experiments/replay.mjs`, `replay-network.mjs` stays untouched until E1. The package starts as a copy; `OLD=1` makes the package's replay import the old modules, `Date.now` patched onto the replay's clock for the old motor as `performance.now` is for the old observation; the old motor's timers are module state (`motor.mjs:54`), so the reference imports it afresh for every run, a query on the import's URL.
- The brain tab is backlog 02's (`docs/hide-and-seek.plan.md`): it compiles against the package, nothing more is checked. It grows its anatomy on its first visit (`view.ts:34`), so a cell it cannot place breaks the tab and nothing else; D's new cells get their place there.
- Live runs with the Bolts, L1 to L3 and the A/B runs of S2, go where the bench is blind: the bundle on the rig, the link, the clock, the motor and the closed loop. Each run is marked and extracted into the bench. L1 is the live baseline; phase D's reference on the bench is C3 as S2 leaves it.

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
- Cell models: `input`, the port's value times `gain`, with `rateTauMs` its events per second smoothed; `relu`, max(0, bias + input); `evidence`, its input added to its potential, the log-evidence, its rate from its population's normalisation; `product`, its add input times the share of its gate inputs in their population (phases C and D only). The leaky cell (`tauMs`) and the old map's ops `mul`, `sub`, `clamp` and `adapt` get no model: nothing in the circuit uses them.
- An edge `[pre, post, weight]` adds weight times the pre's rate; a fourth field names another kind. `gate` multiplies: the cell's rate is its add input times the sum of its gate inputs, weight times rate; for a `product` cell that sum is divided by the total of the gates' population, the share, which `peak` normalisation keeps above 0. Until C1 the file keeps the worm's fourth field, the type 0; C1 drops it with the kinds, `types.ts`'s edge tuple following.
- A step updates in a fixed order of models: inputs, products, the population operators in the order `carry` (the ring's turn, then the stack's slide, both from the readouts taken before either), `forget`, `shift`; then evidence and normalisation, then relu cells in the file's order.
- A population has `normalize` (`peak`: exp of the potential less the population's peak), `decode` (`peak`: the `angle` of the highest rate, with `length` 1 over the sum of the rates, the peak's share of the mass; `mean`: the rate-weighted mean of the cells' `cm` midpoints) and operators: `shift` by a cell's value in degrees; `carry` on a ring turns it by the parallax of the step at the believed distance, on a stack slides it by the step along the believed bearing, in bands, under `minCm` of step not at all and the slide not under `minShift` of a band; `forget` with the travel over `minCm`, by each cell's `tauCm` in cm or `tauParallax` in radians of the step over the believed distance floored at `floorCm`.
- `outputs` names the neuron behind each output port, `readouts` the populations behind the estimate.
- `observation`, `motor` and the operators hold the constants of the three layers, `vis` the brain view's anatomy. The builder's constants (the corner angles, N, the bands, the profiles' thresholds) stay in the builder and come out as the cells' fields.
- `checkCircuit` at load: ids unique; every edge, output, readout and operator names a neuron or population that exists; every port and model is known; every `OutputPort` the motor and the referee read is in `outputs`; every bound input port is one the observation produces; every `evidence` cell names a population.
- Once phase C is done, the scheme is described in the header of `packages/brain/src/types.ts` and this section points there.

## Steps

### L0, far data for the bench

The starts are the plotter's reference points (`plotter.ts`, `floor-plan.svg`): a Bolt reset on a point knows its place, the truth carries no drive out. The three distances of this plan: Sender/blue on rg and Seeker/green on u1, 1.2 m; Sender/blue on d1 and Seeker/green on u1, 2.4 m; Sender/blue on d1 and Seeker/green on u2, 3.2 m. L1 and S2 use them.

- **L0** at each distance a path, Seeker/green standing on its point facing four headings 8 s each, the truth on its start line, and a seek, marked; extracted into the bench as runs 18 to 23. A seek starts where Seeker/green stands, its time limit `TIME_LIMITS` in `runner.ts`, the runaway fence the start distance plus a metre.

### A, the package (behaviour identical)

- **A1** the move: `packages/brain/` as `@bolt/brain`: `package.json` (exports `.`, `./circuit.json`, and `./load` for Node only); network, observation, motor, ring, ladder and load copied as they are, `circuit.json` and `sensory_map.jsonc` beside them; `bench/replay.mjs` and `bench/replay-network.mjs` copied from the experiments onto the package, with the digests and the per-run share of seconds under 30°; `bench/run.mjs` runs them, `OLD=1` the old modules. `ladder` is the sender's side, kept in the package as the referee's tool until core's `sendLadder` holds a code for two beats (not in this plan). Check: digests equal with and without `OLD=1`.
- **A2** the types: the six modules as strict TypeScript; `tsconfig.json` as core's plus `"types": ["node"]` and `@types/node` for `load.ts`, the one module that imports `node:`; `types.ts` with the view's `Circuit`, `NeuronDef` and `Vis`. Check: tsc strict, digests equal.
- **A3** the builder: `build-circuit` and `vis` into `packages/brain/build/`, with `senses.json`. Check: the rebuilt `circuit.json` is byte-identical.
- **A4** the app on `@bolt/brain`: `runner.ts`, `connectome.ts` (`@bolt/brain/circuit.json`), `view.ts`, `anatomy.ts`. Check: the app type-checks and builds, digests equal.

### B, the interfaces (behaviour identical)

- **B1** output ports: `outputs` in `circuit.json` and `Network.output`; the motor a class with its own state, `now` passed to `command`, reading ports only (`mode.near` instead of IR_NEAR); the referee reads `request.short`. The replay calls `command` once a second, after the step that crosses the second: `heading` the last motion sample's, `commanded` the motor's own last heading (the first sample's to start), `dtMs` since the last call capped at 400 as live, `now` the replay's clock; the old motor under `OLD=1` is called the same way. The replay prints the motor digest. Check: digests equal.
- **B2** input ports: the input neurons carry `port`, `gain` and `rateTauMs`; `sensory_map.jsonc`'s channels dissolve into them; its `ir` block becomes `observation`, less `corners`, which is the builder's, plus the layer's constants now in code (the 100 ms second-notify window, the follow's 40 ms and 0.4, `expectMs`, the 3 s a channel stays expected, the watchdog's 1500 ms, the fired command's 300 ms); `MOTOR` becomes `motor`; the observation layer takes its clock, stamps the construction and `start` as ladder switches, and the replay's poke of `switchedAt` goes; `sensory_map.jsonc` leaves the package. Check: digests equal, the rebuild byte-identical.
- **L1** three seeks on the Bolts from the three starts of L0. Everything up to here is behaviour identical by the bench; L1 checks what the bench cannot see: the bundle on the rig, the link, the clock, the motor in the loop. It is the live baseline.

### C, the generic network (behaviour identical)

- **C1** models and populations: `model`, `population`, `populations` with `normalize` and `decode`, `readouts`, the edges three fields; the network dispatches on them, the self cells still found by `role` and `axis`; `checkCircuit`. Check: digests equal, the rebuild byte-identical.
- **C2** the operators as data: `shift`, `carry` and `forget` declared on the populations with their cells and constants; `role` is not read from here on. Check: as C1.
- **C3** the product cells as edges: `model: "product"`; `of` and `gate` become an add edge and gate edges; the brain view's grade reads `model` instead of `of`, so it compiles. Check: as C1. The stash `corner lobes drawn` is decided here: ported onto scheme 2 or dropped.

### S, the silent slots at their beat (A/B with the Bolts)

Today a silent slot is booked when the next frame arrives, at the nose of that moment, and a gap of more than two rounds books nothing. Booked at its own beat, the shift and the carry correct it like any frame, and a long gap counts. Silences count moving or standing, as today.

- **S1** the variant: `observation.slots.mode` is `"late"` (today) or `"beat"`: a slot booked once a channel's expected frame plus `marginMs` (40 to start, the follow's window) has passed without a notify, on the channels of the current ladder heard within `expectMs`; a channel unheard longer books nothing until it is heard again. The bench replays both on every run; the brain tab picks the variant per seek, and the seek's line logs it. Check: `"late"` gives the digests of C3; the bench's numbers for `"beat"` go in the commit message.
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

### E, the end

- **E1** the old code: `packages/core/src/brain/connectome/`, `utils/ladder.mjs`, `experiments/replay.mjs` and `replay-network.mjs` retired, `OLD=1` and the old motor's reference out of the bench; `seek.mjs`, `utils/link-load.mjs` and `agent/pull.sh`, which import or read them, go with the Open item.
- **E2** the docs: the scheme in the header of `types.ts`; `bolt-reference.md` (the ladder's timing names `brain/utils/ladder.mjs`), `brain-view.plan.md` (circuit.json, network.mjs, vis.mjs, replay-network.mjs) and `communication.ts`'s header (sensory_map.jsonc) pointing at the package; this plan closed. `hide-and-seek.md` names no code and stays.

## Open

- The agent's `brain.mjs`, `seek.mjs`, `utils/link-load.mjs` and `pull.sh` onto the package or left, and `packages/brain` in `agent/sync.rules`: at E1.
- The weights before D or after: at C3 every mechanism is data and the bench runs, so the weights can be drawn then and D follow on the better brain; D does not need them. Decided at C3.
