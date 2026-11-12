// circuit.json read from disk, for Node. The browser app imports it through
// its bundler and hands it to `Network` itself, so network.ts knows no file
// system.

import { readFileSync } from 'node:fs';
import type { Circuit } from './types';

export function loadCircuit (): Circuit {
  return JSON.parse(readFileSync(new URL('./circuit.json', import.meta.url), 'utf8')) as Circuit;
}
