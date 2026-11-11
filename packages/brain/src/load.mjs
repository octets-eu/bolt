// The connectome's two data files read from disk, for Node. The browser app
// imports them through its bundler and hands them to `Network` itself, so
// network.mjs knows no file system.

import { readFileSync } from 'node:fs';
import { parseJsonc } from './network.mjs';

export function loadConnectome () {
  return {
    circuit: JSON.parse(readFileSync(new URL('./circuit.json', import.meta.url), 'utf8')),
    map: parseJsonc(readFileSync(new URL('./sensory_map.jsonc', import.meta.url), 'utf8')),
  };
}
