// A run as an image: bench/<n>/run.png, the floor plan cut to the drive, the
// reset point and the sender with a margin, and on it what the seeker did
// and heard, drawn with the plotter's own marks
// (apps/browser/src/components/plotter/sheet.ts): a small dot per locator
// sample, a darker dot per frame heard, filled on the long ladder, a ring on
// the short, a larger dot per corner read that hit with the hearing corners
// red, both Bolts on their start points with their noses, and the seconds
// since the start every 10 s along the track. Beside it the run's numbers.
//
// The points both Bolts were reset on are the run file's `starts` line
// (bench/extract.mjs). The runs from before the points were named have none:
// there green stood on lf and blue on rg, back to back.
//
//   npx tsx bench/image.mjs [n | n-m ...]

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { loadCircuit } from '@bolt/brain/load';
import { SHEET, points, turn, mark } from '../apps/browser/src/components/plotter/sheet.ts';

process.chdir(new URL('..', import.meta.url).pathname);

const COLORS = { 'SB-9129': 'green', 'SB-11DF': 'blue' };   // as apps/browser/src/bolts.ts
const PX_PER_CM = 4, MARGIN_CM = 30, LEGEND_PX = 400, MIN_PX = 560;
const DPR = 2;   // device pixels per pixel: the image is drawn at twice its layout
const channels = loadCircuit().observation.channels;

const picks = process.argv.slice(2).map((a) => a.split('-').map(Number));
const ns = readdirSync('bench').filter((d) => /^\d+$/.test(d)).map(Number).sort((a, b) => a - b)
  .filter((n) => !picks.length || picks.some(([a, b = a]) => n >= a && n <= b));
const plan = await loadImage('apps/browser/public/floor-plan.svg');

/** The run of a bench file: its lines, start and end, the two Bolts, the sender's place in the seeker's frame. */
function read (n) {
  const lines = [];
  for (const l of readFileSync(`bench/${n}/session.jsonl`, 'utf8').split('\n')) { if (l) try { lines.push(JSON.parse(l)); } catch { /* a torn line */ } }
  const info = (e) => (e.name === 'info' && typeof e.data === 'string' ? e.data : '');
  const start = lines.find((e) => /^brain (seek:|path start)/.test(info(e)));
  const end = lines.find((e) => /^brain (seek (found|time|runaway|stopped)|path done)/.test(info(e)));
  const markLine = lines.find((e) => /^brain replay \{/.test(info(e)));
  const json = (text) => { try { return JSON.parse(text.slice(text.indexOf('{'))); } catch { return {}; } };
  const who = info(start).match(/seeker (\S+) on sender (\S+?),/);
  const seeker = who?.[1] ?? start.bolt, sender = who?.[2] ?? Object.keys(COLORS).find((b) => b !== seeker);
  const startsLine = lines.find((e) => /^starts \{/.test(info(e)));
  const starts = startsLine ? json(info(startsLine)) : { 'SB-9129': { point: 'lf' }, 'SB-11DF': { point: 'rg' } };
  return { n, lines, session: lines[0].id, kind: /^brain seek/.test(info(start)) ? 'seek' : 'path', t0: start.t, t1: end.t, endLine: info(end), seeker, sender, pair: [starts[seeker]?.point, starts[sender]?.point], marked: !!markLine };
}

function draw (run) {
  const pair = run.pair;
  if (!points[pair[0]] || !points[pair[1]]) return `no start points for ${run.seeker} and ${run.sender}`;
  const P = points[pair[0]], Q = points[pair[1]], color = COLORS[run.seeker] ?? 'brown';

  // the seeker's samples, frames and reads on the sheet
  const track = [], frames = [], reads = [];
  let here = null, total = 0;
  for (const e of run.lines) {
    if (e.bolt !== run.seeker || e.t < run.t0 || e.t > run.t1) continue;
    const d = e.data;
    if (e.name === 'sensordata' && d?.sensordata?.locator && d.sensordata.angles) {
      const o = turn(P.heading, d.sensordata.locator.positionX, d.sensordata.locator.positionY);
      here = { t: e.t, x: P.x + o.x, y: P.y + o.y, heading: P.heading - d.sensordata.angles.yaw };
      track.push(here);
    } else if (here && e.name === 'infrared' && channels[d?.msg?.payload?.[0]]) {
      frames.push({ ...here, short: channels[d.msg.payload[0]][0] === 'short' });
    } else if (e.name === 'ack' && d?.msg?.device === 24 && d.msg.command === 34 && d.msg.payload?.length === 4) {
      total++;
      const heard = d.msg.payload.map((c) => !!channels[c]);
      if (here && heard.some(Boolean)) reads.push({ ...here, heard });
    }
  }

  // the cut: the drive, both points, a margin
  const xs = [...track.map((p) => p.x), P.x, Q.x], ys = [...track.map((p) => p.y), P.y, Q.y];
  let x0 = Math.min(...xs) - MARGIN_CM, x1 = Math.max(...xs) + MARGIN_CM, y0 = Math.min(...ys) - MARGIN_CM, y1 = Math.max(...ys) + MARGIN_CM;
  const grow = (lo, hi, min) => (hi - lo >= min ? [lo, hi] : [(lo + hi - min) / 2, (lo + hi + min) / 2]);
  [x0, x1] = grow(x0, x1, MIN_PX / PX_PER_CM); [y0, y1] = grow(y0, y1, MIN_PX / PX_PER_CM);
  const w = Math.round((x1 - x0) * PX_PER_CM), h = Math.round((y1 - y0) * PX_PER_CM), px = 1 / PX_PER_CM;
  const canvas = createCanvas((w + LEGEND_PX) * DPR, h * DPR), ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w + LEGEND_PX, h);

  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  ctx.fillStyle = '#ddd'; ctx.fillRect(0, 0, w, h);
  ctx.scale(PX_PER_CM, PX_PER_CM); ctx.translate(-x0, -y0);
  ctx.drawImage(plan, 0, 0, SHEET.width, SHEET.height);
  for (const p of track) mark.position(ctx, p.x, p.y, color, px);
  for (const f of frames) mark.frame(ctx, f.x, f.y, color, f.short, px);
  for (const r of reads) mark.read(ctx, r.x, r.y, r.heading, r.heard, color, px);
  mark.bolt(ctx, Q.x, Q.y, Q.heading, COLORS[run.sender] ?? 'brown', px);
  mark.bolt(ctx, P.x, P.y, P.heading, color, px);
  // the seconds since the start, every 10 s
  ctx.font = `${11 * px}px sans-serif`; ctx.fillStyle = '#000';
  for (let s = 10, k = 0; k < track.length; k++) {
    if (track[k].t - run.t0 < s * 1000) continue;
    ctx.fillText(`${s}`, track[k].x + 5 * px, track[k].y - 5 * px);
    s += 10;
  }
  ctx.restore();

  // the legend: the run's numbers, then the marks
  const seconds = (run.t1 - run.t0) / 1000, long = frames.filter((f) => !f.short).length;
  const result = run.kind === 'seek' ? run.endLine.match(/^brain seek (\S+)/)[1] : 'path done';
  const first = track[0], last = track.at(-1), cm = (p) => Math.hypot(p.x - Q.x, p.y - Q.y).toFixed(0);
  const rows = [
    [`bench ${run.n}: ${run.kind}, ${result}${run.kind === 'seek' ? (run.marked ? ', marked good' : ', not marked') : ''}`, 'bold'],
    [`session ${run.session.slice(0, 16).replace('T', ' ')}`],
    [`${seconds.toFixed(1)} s`],
    [''],
    [`seeker ${run.seeker} ${COLORS[run.seeker]}, reset on ${pair[0]}`],
    [`sender ${run.sender} ${COLORS[run.sender]}, on ${pair[1]}`],
    [`to the sender: ${cm(first)} cm at the start, ${cm(last)} cm at the end`],
    [`closest ${Math.min(...track.map((p) => Math.hypot(p.x - Q.x, p.y - Q.y))).toFixed(0)} cm`],
    [''],
    [`frames heard ${frames.length}: ${long} long, ${frames.length - long} short`],
    [`${(frames.length / seconds).toFixed(1)} a second`],
    [`corner reads ${total}, ${reads.length} hit`],
  ];
  const lx = w + 20;
  let ly = 34;
  ctx.fillStyle = '#000'; ctx.textBaseline = 'middle';
  for (const [text, weight] of rows) { ctx.font = `${weight ?? ''} 15px sans-serif`; ctx.fillText(text, lx, ly); ly += 24; }
  ly += 14;
  ctx.font = '15px sans-serif';
  const key = [
    ['a locator sample', () => { for (let i = -2; i <= 2; i++) mark.position(ctx, lx + 12 + 4 * i, ly, color, 1); }],
    ['a frame heard, long ladder', () => mark.frame(ctx, lx + 12, ly, color, false, 1)],
    ['a frame heard, short ladder', () => mark.frame(ctx, lx + 12, ly, color, true, 1)],
    ['a corner read that hit, the corners in red (here front left)', () => mark.read(ctx, lx + 12, ly, 0, [true, false, false, false], color, 1)],
    ['a Bolt on its start point, the nose', () => mark.bolt(ctx, lx + 12, ly, 0, color, 1)],
    ['seconds since the start', () => { ctx.fillStyle = '#000'; ctx.font = '11px sans-serif'; ctx.fillText('10', lx + 6, ly); ctx.font = '15px sans-serif'; }],
  ];
  for (const [text, symbol] of key) {
    symbol();
    ctx.fillStyle = '#000';
    const words = text.split(' ');   // wrapped to the legend's width
    let line = '';
    for (const word of words) {
      if (ctx.measureText(`${line} ${word}`).width > LEGEND_PX - 70 && line) { ctx.fillText(line, lx + 36, ly); ly += 20; line = word; } else line = line ? `${line} ${word}` : word;
    }
    ctx.fillText(line, lx + 36, ly);
    ly += 30;
  }
  writeFileSync(`bench/${run.n}/run.png`, canvas.toBuffer('image/png'));
  return `${(w + LEGEND_PX) * DPR} x ${h * DPR}, ${track.length} samples, ${frames.length} frames, ${reads.length} of ${total} reads hit, ${pair[0]} to ${pair[1]}`;
}

for (const n of ns) console.log(`${String(n).padStart(3)} ${draw(read(n))}`);
