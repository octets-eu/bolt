// The bench over its runs: bench/replay.mjs scores the brain over the
// reference runs, bench/ref/<name>/session.jsonl with the camera's track
// beside it, and over the marked seeks of the store, bench/<n>/session.jsonl
// (bench/extract.mjs), whose mark carries the sender's place; one line per
// run with its name or number, then the total. A path of the store is not
// scored: its places are the locator's. Numbers, ranges and ref/<name> pick
// runs (`ref/coil 37-40`); every other argument goes to replay.mjs, and so
// does the environment: CIRCUIT=<path> scores a circuit under test.
//
//   node bench/run.mjs [ref/<name> | n | n-m ...] [--without corners|frames|slots] [--slots late|beat] [--trace] [--steps <file>]

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

process.chdir(new URL('..', import.meta.url).pathname);
const isPick = (a) => /^(\d+(-\d+)?|ref\/.+)$/.test(a);
const picks = process.argv.slice(2).filter(isPick), args = process.argv.slice(2).filter((a) => !isPick(a));
const [head, ...rows] = readFileSync('bench/index.tsv', 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
const col = (r, name) => r[head.indexOf(name)];
const refs = readdirSync('bench/ref').filter((d) => existsSync(`bench/ref/${d}/track.tsv`)).sort().map((d) => `ref/${d}`);
const seeks = rows.filter((r) => col(r, 'mark') === 'yes').map((r) => col(r, 'n'));
const picked = (name) => !picks.length || picks.some((p) => p === name || (/^\d/.test(p) && /^\d/.test(name) && Number(name) >= Number(p.split('-')[0]) && Number(name) <= Number(p.split('-').at(-1))));
const names = [...refs, ...seeks].filter(picked);
if (!names.length) { console.log('no run to score'); process.exit(0); }
const out = execFileSync('npx', ['tsx', 'bench/replay.mjs', ...names.map((n) => `bench/${n}/session.jsonl`), ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
let k = -1;   // each file holds one run with a truth, so the runs come in the files' order
for (const line of out.split('\n')) {
  if (/^  (seek|path) /.test(line)) k++;
  if (line) console.log(/^  (seek|path) /.test(line) ? `${names[k].padStart(3)} ${line.trimStart()}` : line);
}
