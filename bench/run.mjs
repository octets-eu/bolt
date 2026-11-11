// The bench over its runs: bench/replay.mjs scores the brain over
// bench/<n>/session.jsonl (bench/extract.mjs), one line per run with its
// number, then the total. Only runs with a truth are scored: a seek with its
// mark, which carries the sender's place, and a path. Numbers and ranges
// pick runs (`1-10 14`); every other argument goes to replay.mjs, and so does
// the environment: CIRCUIT=<path> scores a circuit under test, OLD=1 the old
// modules in packages/core/src/brain (docs/core-brain.plan.md).
//
//   node bench/run.mjs [n | n-m ...] [--trace] [--steps <file>] [--estimator network]

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

process.chdir(new URL('..', import.meta.url).pathname);
const [head, ...rows] = readFileSync('bench/index.tsv', 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
const col = (r, name) => r[head.indexOf(name)];
const picks = process.argv.slice(2).filter((a) => /^\d+(-\d+)?$/.test(a)).map((a) => a.split('-').map(Number));
const args = process.argv.slice(2).filter((a) => !/^\d+(-\d+)?$/.test(a));
const ns = rows.filter((r) => col(r, 'mark') === 'yes' || col(r, 'kind') === 'path').map((r) => Number(col(r, 'n')))
  .filter((n) => !picks.length || picks.some(([a, b = a]) => n >= a && n <= b));
const out = execFileSync('npx', ['tsx', 'bench/replay.mjs', ...ns.map((n) => `bench/${n}/session.jsonl`), ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
let k = -1;   // each file holds one run with a truth, so the runs come in the files' order
for (const line of out.split('\n')) {
  if (/^  (seek|path) /.test(line)) k++;
  if (line) console.log(/^  (seek|path) /.test(line) ? `${String(ns[k]).padStart(3)} ${line.trimStart()}` : line);
}
