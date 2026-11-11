// The connectome's two data files read from disk, for Node. The browser app
// imports them through its bundler and hands them to `Network` itself, so
// network.ts knows no file system.

import { readFileSync } from 'node:fs';
import { parseJsonc } from './network';
import type { Circuit, Connectome, SensoryMap } from './types';

export function loadConnectome (): Connectome {
  return {
    circuit: JSON.parse(readFileSync(new URL('./circuit.json', import.meta.url), 'utf8')) as Circuit,
    map: parseJsonc<SensoryMap>(readFileSync(new URL('./sensory_map.jsonc', import.meta.url), 'utf8')),
  };
}
