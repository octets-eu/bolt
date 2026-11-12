// @bolt/brain: the seeker's brain. The network runs circuit.json, the
// observation layer turns the Bolt's streams into its inputs, the motor turns
// its outputs into a roll; the ladder is the sender's side, the referee's
// tool. What the app and the bench import is here; `@bolt/brain/load` reads
// the circuit from disk, Node only. docs/core-brain.plan.md.

export { Network } from './network';
export { Observation } from './observation';
export type { ObservationStats } from './observation';
export { ringVector } from './ring';
export { LadderSender } from './ladder';
export { Motor, fireRoll } from './motor';
export type { Roll } from './motor';
export type { Circuit, NeuronDef, Vis, V3, ObservationConfig, MotorConfig, Corner, InputPort, Sources, Motion, Estimate, OutputPort } from './types';
