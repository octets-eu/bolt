// A run's true track from the phone's frames saved beside it
// (bench/camrec.mjs): where the seeker's lit matrix stood in every frame, on
// the sheet, against the run's own clock. Written as TSV: t (the session's
// ms), x, y (sheet, cm), pixels (the patch's size).
//
// The run is the session file's last path (`brain path start` to `done`),
// its seeker reset on a reference point (the `starts` line). The survey
// keeps the seeker's matrix dark for the run's first seconds and lit from
// then on, so a frame of that dark time is what every later frame is compared
// with (apps/browser/src/tracking/glow.ts), and the largest patch that got
// brighter and is blue is the matrix, MIN_PIXELS at least: less is another
// Bolt's flicker, and the floor the seeker stood on in the dark frame got
// brighter too, but red; its floor point by tracking/floorcam.ts.
//
// A frame shows the floor some seconds late. That lag is found per run: the
// one, within LAGS, for which the camera's course, the direction from one
// frame's place to the next, follows the locator's over the same moments
// best. The locator drifts in place and in scale, a spiral asked for 90 cm
// came out 97, so places and distances do not line up; the course does, it
// turns 23 degrees a second on that spiral whatever the centre. The track's
// times are the frames' less their age less the lag.
//
//   npx tsx bench/camtrack.mjs <frames dir> <session.jsonl> [<out.tsv>]

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { glows } from '../apps/browser/src/tracking/glow.ts';
import { boltOnSheet } from '../apps/browser/src/tracking/floorcam.ts';
import { points, turn } from '../apps/browser/src/components/plotter/sheet.ts';

const [dir, sessionPath, out] = process.argv.slice(2);
if (!dir || !sessionPath) { console.error('usage: npx tsx bench/camtrack.mjs <frames dir> <session.jsonl> [<out.tsv>]'); process.exit(1); }
const DARK_MS = 2500;      // into the run, the moment whose frame is the dark one
const NOMINAL_LAG = 2750;  // for picking that frame, before the lag is found
const MIN_PIXELS = 100;    // a lit matrix showed 240 to 400 pixels at the frame's edge and middle
const LAGS = [500, 5000];  // the lags tried, ms
const STEP_CM = 4;          // a course is taken from two frames this far apart and more, within a second and a half

// the run: its clock against the wall's, its start, the seeker's start point, the locator's samples
const lines = readFileSync(sessionPath, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const info = (e) => (e.name === 'info' && typeof e.data === 'string' ? e.data : '');
const epoch0 = Date.parse(lines.find((e) => e.kind === 'session').startedAt);
const start = lines.findLast((e) => info(e).startsWith('brain path start'));
const done = lines.find((e) => e.t > start.t && info(e).startsWith('brain path done'));
const lit = lines.find((e) => e.t > start.t && info(e).startsWith('archimedean start')) ?? start;
const seeker = start.bolt;
const starts = JSON.parse(info(lines.findLast((e) => e.t <= start.t && info(e).startsWith('starts {'))).slice(7));
const P = points[starts[seeker].point];
const locator = lines.filter((e) => e.bolt === seeker && e.t >= start.t && e.t <= done.t && e.name === 'sensordata' && e.data?.sensordata?.locator)
  .map((e) => { const L = e.data.sensordata.locator, o = turn(P.heading, L.positionX, L.positionY); return { t: e.t, x: P.x + o.x, y: P.y + o.y }; });

// the frames, by the moment the forwarder wrote them, on the session's clock
const frames = readdirSync(dir).filter((f) => f.endsWith('.jpg')).map((f) => { const [at, age] = f.slice(0, -4).split('-').map(Number); return { f, t: at - age - epoch0 }; }).sort((a, b) => a.t - b.t);
const raw = async (f) => { const { data, info: i } = await sharp(`${dir}/${f}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: i.width, h: i.height }; };
const darkFrame = frames.reduce((a, b) => (Math.abs(b.t - NOMINAL_LAG - start.t - DARK_MS) < Math.abs(a.t - NOMINAL_LAG - start.t - DARK_MS) ? b : a));
const dark = await raw(darkFrame.f);

const seen = [];
let none = 0;
for (const fr of frames) {
  if (fr.t - NOMINAL_LAG < lit.t - 1000) continue;   // the dark time
  const now = await raw(fr.f), g = glows(now.data, dark.data, now.w, now.h).find((p) => p.rgb[2] > p.rgb[0] + 30);
  if (!g || g.n < MIN_PIXELS) { none++; continue; }
  seen.push({ t: fr.t, ...boltOnSheet(g.x / now.w, g.y / now.w), n: g.n });
}

// the lag: the camera's distance from the start point against the locator's, at the same moment
const at = (t) => { const k = locator.findIndex((p) => p.t >= t); if (k <= 0) return null; const a = locator[k - 1], b = locator[k], f = (t - a.t) / (b.t - a.t); return { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) }; };
const course = (a, b) => Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI;
const steps = seen.slice(1).map((b, k) => [seen[k], b]).filter(([a, b]) => b.t - a.t < 1500 && Math.hypot(b.x - a.x, b.y - a.y) >= STEP_CM);
const miss = (lag) => { let s = 0, n = 0; for (const [a, b] of steps) { const la = at(a.t - lag), lb = at(b.t - lag); if (la && lb && Math.hypot(lb.x - la.x, lb.y - la.y) >= STEP_CM / 2) { s += Math.abs(((course(a, b) - course(la, lb) + 540) % 360) - 180); n++; } } return n ? s / n : Infinity; };
let lag = LAGS[0];
for (let l = LAGS[0]; l <= LAGS[1]; l += 25) if (miss(l) < miss(lag)) lag = l;
if (lag === LAGS[0] || lag === LAGS[1]) console.log('the lag sits at the edge of the range tried: not found');

const track = seen.map((p) => ({ ...p, t: p.t - lag })).filter((p) => p.t >= start.t && p.t <= done.t);
const off = track.map((p) => { const l = at(p.t); return l ? Math.hypot(p.x - l.x, p.y - l.y) : null; }).filter((v) => v !== null).sort((a, b) => a - b);
console.log(`${frames.length} frames, dark ${darkFrame.f}, ${seen.length} with the matrix, ${none} without; lag ${lag} ms (the course off by ${miss(lag).toFixed(1)} deg on average over ${steps.length} steps)`);
console.log(`track: ${track.length} points over ${((track.at(-1).t - track[0].t) / 1000).toFixed(1)} s; first ${track[0].x.toFixed(1)}, ${track[0].y.toFixed(1)}, last ${track.at(-1).x.toFixed(1)}, ${track.at(-1).y.toFixed(1)}; the start point ${P.x}, ${P.y}`);
console.log(`camera against locator: median ${off[Math.floor(off.length / 2)].toFixed(1)} cm apart, at most ${off.at(-1).toFixed(1)} cm; at the end the locator says ${locator.at(-1).x.toFixed(1)}, ${locator.at(-1).y.toFixed(1)}`);
if (out) writeFileSync(out, 't\tx\ty\tpixels\n' + track.map((p) => `${p.t.toFixed(1)}\t${p.x.toFixed(1)}\t${p.y.toFixed(1)}\t${p.n}`).join('\n') + '\n');
