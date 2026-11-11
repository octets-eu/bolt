// The brain's connectome as the bundler delivers it: @bolt/brain's
// circuit.json parsed, its sensory_map.jsonc as text through Vite's ?raw,
// stripped by the network's own parser. The same two objects
// @bolt/brain/load reads from disk in Node.

import circuit from '@bolt/brain/circuit.json';
import mapText from '@bolt/brain/sensory_map.jsonc?raw';
import { parseJsonc } from '@bolt/brain';
import type { Circuit, Connectome, SensoryMap } from '@bolt/brain';

// the JSON import's inferred type has arrays where the file holds tuples (`pos`, the edges), hence the step over unknown
export const connectome: Connectome = { circuit: circuit as unknown as Circuit, map: parseJsonc<SensoryMap>(mapText) };
