// @bolt/brain: the seeker's brain. The network runs circuit.json, the
// observation layer turns the Bolt's streams into its inputs, the motor turns
// its outputs into a roll; the ladder is the sender's side, the referee's
// tool. What the app and the bench import is here; `@bolt/brain/load` reads
// the circuit and the map from disk, Node only. docs/core-brain.plan.md.

export { Network, parseJsonc } from './network.mjs';
export { Observation } from './observation.mjs';
export { ringVector } from './ring.mjs';
export { LadderSender } from './ladder.mjs';
export { motorCommand, fireRoll, MOTOR } from './motor.mjs';
