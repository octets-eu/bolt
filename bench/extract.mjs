// The bench's runs: every seek the user marked good, cut out of the app's
// session files into bench/<n>/session.jsonl, numbered by time, and
// bench/index.tsv, which names each run's session and source. A run's file
// holds its session's header line, the run's lines from its start to its
// end, and its mark, verbatim; it scores on the bench as in its source.
//
// The sources are the month zips the app archives into apps/browser/sessions/
// and the exports in frames/ (session-run<k>.jsonl), which hold marks the
// zips do not have and today's runs before they are archived. Where both
// hold a run with its mark, the zip's copy is taken.
//
//   node bench/extract.mjs

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';

const RUN = /^brain seek(:| found| time| runaway| stopped)/;   // the start, `brain seek:`, and the ends
const MARK = /^brain replay (\{.*\})$/;
const root = new URL('..', import.meta.url).pathname;
process.chdir(root);

const sources = [];
const ZIPS = 'apps/browser/sessions';
for (const zip of readdirSync(ZIPS).filter((f) => f.endsWith('.zip')).sort())
  for (const m of execFileSync('unzip', ['-Z1', `${ZIPS}/${zip}`], { encoding: 'utf8' }).split('\n').filter((x) => x.endsWith('.jsonl'))) sources.push(`${ZIPS}/${zip}:${m}`);
for (const f of readdirSync('frames').filter((f) => /^session-run\d+\.jsonl$/.test(f))) sources.push(`frames/${f}`);
const read = (spec) => { const i = spec.indexOf('.zip:'); return i > 0 ? execFileSync('unzip', ['-p', spec.slice(0, i + 4), spec.slice(i + 5)], { encoding: 'utf8', maxBuffer: 1 << 30 }) : readFileSync(spec, 'utf8'); };

const runs = new Map();   // session id and start time -> the run
for (const spec of sources) {
  const raw = read(spec).split('\n').filter(Boolean);
  const lines = raw.map((l) => { try { return JSON.parse(l); } catch { return null; } });   // a torn line stays out
  const head = lines.findIndex((e) => e?.kind === 'session'), id = lines[head]?.id;
  let open = null, ended = null;
  lines.forEach((e, k) => {
    const d = e?.data;
    if (e?.name !== 'info' || typeof d !== 'string') return;
    const m = d.match(RUN);
    if (m) { if (m[1] === ':') open = { from: k, t0: e.t }; else if (open) { ended = { ...open, to: k }; open = null; } return; }
    const mark = d.match(MARK);
    if (mark && ended) {   // the mark follows its run
      const key = `${id} ${ended.t0}`;
      if (!runs.has(key)) runs.set(key, { id, t0: ended.t0, spec, mark: JSON.parse(mark[1]), lines: [raw[head], ...raw.slice(ended.from, ended.to + 1), raw[k]] });
      ended = null;
    }
  });
}

const sorted = [...runs.values()].sort((a, b) => a.id.localeCompare(b.id) || a.t0 - b.t0);
const index = ['n\tsession\tseeker\tresult\ts\tsource'];
sorted.forEach((r, i) => {
  mkdirSync(`bench/${i + 1}`, { recursive: true });
  writeFileSync(`bench/${i + 1}/session.jsonl`, r.lines.join('\n') + '\n');
  index.push([i + 1, r.id, r.mark.seeker, r.mark.result, r.mark.seconds, r.spec].join('\t'));
});
writeFileSync('bench/index.tsv', index.join('\n') + '\n');
console.log(`${sorted.length} runs into bench/1 to bench/${sorted.length}`);
