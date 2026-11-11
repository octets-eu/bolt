// The bench's runs: every seek and every path the app recorded, cut out of
// the session files into bench/<n>/session.jsonl. bench/ is the store: a run
// once written keeps its number and its file, so a mark added by hand stays;
// a new run gets the next number. A run's file holds its session's header
// line, the run's lines from its start to its end and, for a seek the user
// marked good, the mark, verbatim. bench/index.tsv lists every run: its
// session, its start on the session's clock, kind, seeker, mark, length,
// end line and source; it is rewritten from the store on every extract.
//
// The sources are the month zips the app archives into
// apps/browser/sessions/; session files given as arguments are read after
// them, for a run not archived yet or a file that carries what the zip does
// not. Of a new run found twice, a copy with a mark is taken. A path
// followed by `brain path void` stays out.
//
//   node bench/extract.mjs [session.jsonl ...]

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';

const START = /^brain (seek:|path start)/, END = /^brain (seek (found|time|runaway|stopped)|path done)/;
const MARK = /^brain replay (\{.*\})$/;
const VOID = /^brain path void/;   // the user's verdict on the path just ended: not for the bench
const ZIPS = 'apps/browser/sessions';
process.chdir(new URL('..', import.meta.url).pathname);

const read = (spec) => { const i = spec.indexOf('.zip:'); return i > 0 ? execFileSync('unzip', ['-p', spec.slice(0, i + 4), spec.slice(i + 5)], { encoding: 'utf8', maxBuffer: 1 << 30 }) : readFileSync(spec, 'utf8'); };
const info = (e) => (e?.name === 'info' && typeof e.data === 'string' ? e.data : null);

/** The runs of a session file's text: header, kind, start, the lines from start to end, the mark of a seek. */
function runsOf (text) {
  const raw = text.split('\n').filter(Boolean);
  const lines = raw.map((l) => { try { return JSON.parse(l); } catch { return null; } });   // a torn line stays out
  const head = lines.findIndex((e) => e?.kind === 'session');
  const out = [];
  let open = null, last = null;
  lines.forEach((e, k) => {
    const d = info(e);
    if (d === null) return;
    if (START.test(d)) { open = { kind: d.startsWith('brain seek') ? 'seek' : 'path', from: k, t0: e.t, seeker: d.match(/seeker (\S+)/)?.[1] ?? e.bolt }; last = null; return; }
    if (END.test(d) && open) { last = { ...open, to: k, t1: e.t, end: d, id: lines[head]?.id, lines: [raw[head], ...raw.slice(open.from, k + 1)] }; out.push(last); open = null; return; }
    if (VOID.test(d) && last?.kind === 'path') { out.pop(); last = null; return; }
    const mark = d.match(MARK);
    if (mark && last?.kind === 'seek' && !last.mark) { last.mark = JSON.parse(mark[1]); last.lines.push(raw[k]); }   // the mark follows its run
  });
  return out;
}

// the store: every run already in bench/, by its session and start
const stored = new Map();
const old = existsSync('bench/index.tsv') ? readFileSync('bench/index.tsv', 'utf8').split('\n').filter(Boolean) : [];
const cols = old[0]?.split('\t') ?? [];
const sourceOf = new Map(old.slice(1).map((l) => l.split('\t')).map((r) => [r[0], r[cols.indexOf('source')]]));
for (const n of readdirSync('bench').filter((d) => /^\d+$/.test(d)).map(Number)) {
  const [r] = runsOf(readFileSync(`bench/${n}/session.jsonl`, 'utf8'));
  stored.set(`${r.id} ${r.t0}`, { ...r, n, source: sourceOf.get(String(n)) ?? '-' });
}

// new runs from the zips, then the files given
const sources = [];
for (const zip of readdirSync(ZIPS).filter((f) => f.endsWith('.zip')).sort())
  for (const m of execFileSync('unzip', ['-Z1', `${ZIPS}/${zip}`], { encoding: 'utf8' }).split('\n').filter((x) => x.endsWith('.jsonl'))) sources.push(`${ZIPS}/${zip}:${m}`);
sources.push(...process.argv.slice(2));
const found = new Map();
for (const spec of sources) for (const r of runsOf(read(spec))) {
  const key = `${r.id} ${r.t0}`;
  if (stored.has(key) || (found.has(key) && (found.get(key).mark || !r.mark))) continue;
  found.set(key, { ...r, source: spec });
}

let next = Math.max(0, ...[...stored.values()].map((r) => r.n)) + 1;
const added = [...found.values()].sort((a, b) => a.id.localeCompare(b.id) || a.t0 - b.t0);
for (const r of added) {
  r.n = next++;
  mkdirSync(`bench/${r.n}`, { recursive: true });
  writeFileSync(`bench/${r.n}/session.jsonl`, r.lines.join('\n') + '\n');
  stored.set(`${r.id} ${r.t0}`, r);
}

const rows = [...stored.values()].sort((a, b) => a.n - b.n)
  .map((r) => [r.n, r.id, r.t0, r.kind, r.seeker, r.mark ? 'yes' : 'no', ((r.t1 - r.t0) / 1000).toFixed(1), r.end.slice(0, 60), r.source].join('\t'));
writeFileSync('bench/index.tsv', ['n\tsession\tstart\tkind\tseeker\tmark\ts\tend\tsource', ...rows].join('\n') + '\n');
console.log(`${added.length} new, ${stored.size} runs in bench/`);
