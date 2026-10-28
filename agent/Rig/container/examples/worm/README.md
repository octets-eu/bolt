# The worm's files, as an example of the format

Two data files from a C. elegans simulation, here for their shape, not their content. The worm computes chemotaxis on a crawling body and has no heading ring; the Bolt's circuit is a different animal.

- `worm_circuit.json`: 272 neurons, each `{id, type, role, side, pos}`, and 5434 directed edges `[pre, post, weight, type]`, chemical weights signed by transmitter (type 0), gap junctions stored both ways (type 1). Fifty neurons carry a hand-assigned role (sensory classes, command interneurons, turning, proprioception), the rest are `other`. Roles are where the sensory drives are injected and where the motor rates are read out.
- `sensory_map.jsonc`: every sense as a channel, a named source through a pipeline of typed ops (`log10`, `gain`, `clamp`, `delay`, `sub`, `lowpass`, `threshold`, `mul`, combine by `add` or `max`) into a named drive. Every constant is in the file, none in code; the comments are the rationale.

Source and terms in `DATA_LICENSE.md` (Cook et al. 2019, via WormWiring).
