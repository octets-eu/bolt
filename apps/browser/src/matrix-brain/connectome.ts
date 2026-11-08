// The agent's connectome as the bundler delivers it: circuit.json parsed,
// sensory_map.jsonc as text through Vite's ?raw, stripped by the network's own
// parser. The same two objects load.mjs reads from disk in Node.

import circuit from '../../../../packages/core/src/brain/connectome/circuit.json';
import mapText from '../../../../packages/core/src/brain/connectome/sensory_map.jsonc?raw';
import { parseJsonc } from '../../../../packages/core/src/brain/connectome/network.mjs';

export const connectome = { circuit, map: parseJsonc(mapText) };
