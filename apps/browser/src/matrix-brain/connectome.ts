// The brain's connectome as the bundler delivers it: @bolt/brain's
// circuit.json parsed, the same object @bolt/brain/load reads from disk in
// Node.

import json from '@bolt/brain/circuit.json';
import type { Circuit } from '@bolt/brain';

// the JSON import's inferred type has arrays where the file holds tuples (`pos`, the edges), hence the step over unknown
export const circuit = json as unknown as Circuit;
