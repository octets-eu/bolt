// The bench over its runs: experiments/replay.mjs scores the brain over
// bench/<n>/session.jsonl (bench/extract.mjs), one line per run with its
// number, then the total. Arguments go to replay.mjs, and so does the
// environment: CIRCUIT=<path> scores a circuit under test.
//
//   node bench/run.mjs [--trace] [--estimator network]

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

process.chdir(new URL('..', import.meta.url).pathname);
const ns = readdirSync('bench').filter((d) => /^\d+$/.test(d)).map(Number).sort((a, b) => a - b);
const out = execFileSync('npx', ['tsx', 'packages/core/src/experiments/replay.mjs', ...ns.map((n) => `bench/${n}/session.jsonl`), ...process.argv.slice(2)], { encoding: 'utf8', maxBuffer: 1 << 26 });
let k = -1;   // each file holds one run, so the runs come in the files' order
for (const line of out.split('\n')) {
  if (/^  (seek|path|sweepTest|approachTest) /.test(line)) k++;
  if (line) console.log(/^  \S/.test(line) && !line.startsWith('  |') ? `${String(ns[k]).padStart(3)} ${line.trimStart()}` : line);
}
