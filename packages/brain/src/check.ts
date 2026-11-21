// circuit.json checked before a network is built from it: what the file
// names exists, and what the layers round the network read is there. A file
// that fails throws with everything found, a line each.

import type { Circuit, Corner, InputPort, OutputPort } from './types';

const MODELS = new Set(['input', 'relu', 'evidence', 'product']);
/** Every port the motor and the referee read. */
const OUTPUT_PORTS: Record<OutputPort, true> = {
  'steer.fwd': true, 'steer.back': true, 'steer.right': true, 'steer.left': true,
  'mode.search': true, 'mode.roam': true, 'mode.axis': true, 'mode.near': true, 'request.short': true,
};
/** The ports the observation layer produces whatever the ladder; beside them a port per corner and, per channel of `observation.channels`, its frame's and its slot's. */
const FIXED_PORTS: Record<Exclude<InputPort, `frame.ch${number}` | `slot.ch${number}` | `corner.${Corner}`>, true> = {
  'frame.any': true, 'frame.carrier': true, 'frame.miss': true, 'frame.closeness': true, 'carrier.down': true, 'carrier.up': true,
  'ladder.near': true, 'ladder.settled': true,
  'self.turned': true, 'self.fwd': true, 'self.right': true, 'self.still': true, 'self.forward': true,
};
const CORNER_PORTS: Record<`corner.${Corner}`, true> = { 'corner.FL': true, 'corner.FR': true, 'corner.BR': true, 'corner.BL': true };

export function checkCircuit (circuit: Circuit): void {
  const bad: string[] = [];
  if (circuit.scheme !== 2) bad.push(`scheme ${String(circuit.scheme)}, not 2`);
  const ids = new Set<string>();
  for (const n of circuit.neurons) { if (ids.has(n.id)) bad.push(`neuron ${n.id} twice`); ids.add(n.id); }
  const cell = (name: string, where: string): void => { if (!ids.has(name)) bad.push(`${where}: no neuron ${name}`); };
  const populations = new Map(Object.entries(circuit.populations));
  const produced = new Set([...Object.keys(FIXED_PORTS), ...Object.keys(CORNER_PORTS), ...Object.keys(circuit.observation.channels).flatMap((ch) => [`frame.ch${ch}`, `slot.ch${ch}`])]);
  for (const n of circuit.neurons) {
    if (!MODELS.has(n.model)) bad.push(`neuron ${n.id}: model ${String(n.model)}`);
    if (n.model === 'input' && !(n.port !== undefined && produced.has(n.port))) bad.push(`neuron ${n.id}: port ${String(n.port)}, not one the observation produces`);
    if (n.model === 'evidence' && !(n.population !== undefined && populations.has(n.population))) bad.push(`neuron ${n.id}: population ${String(n.population)}`);
    if (n.model === 'product') {
      if (n.of === undefined || !n.gate?.length) bad.push(`neuron ${n.id}: a product without \`of\` or \`gate\``);
      for (const name of [...(n.of === undefined ? [] : [n.of]), ...(n.gate ?? [])]) cell(name, `neuron ${n.id}`);
    }
  }
  for (const [pre, post] of circuit.edges) { cell(pre, `edge ${pre} ${post}`); cell(post, `edge ${pre} ${post}`); }
  for (const [name, p] of populations) {
    if (p.normalize !== 'peak') bad.push(`population ${name}: normalize ${String(p.normalize)}`);
    if (p.decode !== 'peak' && p.decode !== 'mean') bad.push(`population ${name}: decode ${String(p.decode)}`);
    const decoded = (what: string, other: string | undefined, decode: string): void => {
      if (other === undefined || populations.get(other)?.decode !== decode) bad.push(`population ${name}: ${what} names ${String(other)}, no population decoded by its ${decode}`);
    };
    if (p.shift) { cell(p.shift.by, `population ${name}: shift`); if (p.decode !== 'peak') bad.push(`population ${name}: shift on a population not decoded by its peak`); }
    for (const [what, op] of [['carry', p.carry], ['forget', p.forget]] as const) if (op) { cell(op.fwd, `population ${name}: ${what}`); cell(op.right, `population ${name}: ${what}`); }
    if (p.carry && p.decode === 'peak') decoded('carry', p.carry.distance, 'mean');
    if (p.carry && p.decode === 'mean') { decoded('carry', p.carry.bearing, 'peak'); if (typeof p.carry.minShift !== 'number') bad.push(`population ${name}: carry without minShift`); }
    if (p.forget?.distance !== undefined) { decoded('forget', p.forget.distance, 'mean'); if (typeof p.forget.floorCm !== 'number') bad.push(`population ${name}: forget by a distance without floorCm`); }
    if (p.forget && p.forget.distance === undefined && circuit.neurons.some((n) => n.population === name && n.tauParallax !== undefined)) bad.push(`population ${name}: cells with tauParallax, forget names no distance`);
  }
  for (const port of Object.keys(OUTPUT_PORTS)) if (!(port in circuit.outputs)) bad.push(`output ${port} missing`);
  for (const [port, name] of Object.entries(circuit.outputs)) cell(name, `output ${port}`);
  const readout = (what: string, name: string | undefined, decode: string): void => {
    if (name !== undefined && populations.get(name)?.decode !== decode) bad.push(`readout ${what}: ${name} is no population decoded by its ${decode}`);
  };
  if (circuit.readouts.bearing === undefined) bad.push('readout bearing missing');
  readout('bearing', circuit.readouts.bearing, 'peak');
  readout('distance', circuit.readouts.distance, 'mean');
  if (bad.length) throw new Error(`circuit.json:\n${bad.join('\n')}`);
}
