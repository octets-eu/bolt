// A run's camera frames as a video: the phone's frames saved beside the run
// (bench/camrec.mjs), cut to where the Bolts drove with a margin and to two
// by one, turned a quarter turn so the seeker's line runs from left to right,
// at SPEED times the run's pace and FPS pictures a second. The camera gives
// about two frames a second, so each one stays until the next: the Bolts in
// the picture jump. What is drawn over it, in orange, is placed anew for
// every picture of the video and moves evenly: round the seeker a thin ring
// at the track's place for that moment, and for HOLD_MS after a corner read
// that hit a thick quarter of it for every corner that heard, turned with
// the nose, so a read that named all four is a full thick ring; round the
// sender a full ring for the level it has just sent, the wider the stronger,
// fading until the next.
//
// The run's folder holds session.jsonl and the camera's track.tsv
// (bench/camtrack.mjs). A frame shows the floor some seconds late; that lag
// is read off the track, whose times are its frames' less the lag, and
// every mark is drawn at the moment the picture shows, not the one it arrived.
//
//   npx tsx bench/camvideo.mjs <frames dir> <run dir> <out.mp4>

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { toFrame, POSE, LIFT } from '../apps/browser/src/tracking/floorcam.ts';
import { points } from '../apps/browser/src/components/plotter/sheet.ts';

const [dir, runDir, out] = process.argv.slice(2);
if (!dir || !runDir || !out) { console.error('usage: npx tsx bench/camvideo.mjs <frames dir> <run dir> <out.mp4>'); process.exit(1); }
const SPEED = 2, FPS = 30;
const MARGIN_PX = 70;      // round everything the Bolts reach
const HOLD_MS = 400;       // a read's quarters stay this long, fading
const BEAT_MS = 200;       // the sender's ring fades over a beat
const RING_PX = 22;        // the ring's radius, a Bolt's is about 13
const ORANGE = '255, 140, 0';
const CORNERS = [-45, 45, 135, -135];   // FL, FR, BR, BL, deg off the nose, the order a read replies in

// the run: its clock against the wall's, both Bolts' points, the seeker's yaw, the reads that hit, the sender's sends
const lines = readFileSync(join(runDir, 'session.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const info = (e) => (e.name === 'info' && typeof e.data === 'string' ? e.data : '');
const epoch0 = Date.parse(lines.find((e) => e.kind === 'session').startedAt);
const start = lines.findLast((e) => info(e).startsWith('brain path start')), done = lines.find((e) => e.t > start.t && info(e).startsWith('brain path done'));
const seeker = start.bolt, sender = JSON.parse(info(start).slice(info(start).indexOf('{'))).sender;
const starts = JSON.parse(info(lines.findLast((e) => e.t <= start.t && info(e).startsWith('starts {'))).slice(7));
const P = points[starts[seeker].point], Q = points[starts[sender].point];
const yaws = lines.filter((e) => e.bolt === seeker && e.name === 'sensordata' && e.data?.sensordata?.angles).map((e) => ({ t: e.t, yaw: e.data.sensordata.angles.yaw }));
const reads = lines.filter((e) => e.bolt === seeker && e.name === 'ack' && e.data?.msg?.command === 34 && e.data.msg.payload?.some((c) => c !== 255)).map((e) => ({ t: e.t, heard: e.data.msg.payload.map((c) => c !== 255) }));
const sends = lines.filter((e) => e.bolt === sender && e.name === 'action' && e.data?.name === 'infrared').map((e) => ({ t: e.t, strength: e.data.payload[1] }));
const levels = [...new Set(sends.map((s) => s.strength))].sort((a, b) => a - b);

// the camera's track and its lag: the one for which the track's own points fall on frames
const track = readFileSync(join(runDir, 'track.tsv'), 'utf8').split('\n').slice(1).filter(Boolean).map((l) => { const [t, x, y, n] = l.split('\t').map(Number); return { t, x, y, n }; });
const frames = readdirSync(dir).filter((f) => f.endsWith('.jpg')).map((f) => { const [at, age] = f.slice(0, -4).split('-').map(Number); return { f, t: at - age - epoch0 }; }).sort((a, b) => a.t - b.t);
const frameTimes = new Set(frames.map((fr) => fr.t)), seen = track.filter((p) => p.n > 0);
const fits = (lag) => seen.filter((p) => frameTimes.has(Math.round(p.t + lag))).length;
const lag = frames.map((fr) => Math.round(fr.t - seen[0].t)).filter((l) => l > 0 && l < 6000).reduce((a, b) => (fits(b) > fits(a) ? b : a));

/** The last of `list` at or before `t`. */
const before = (list, t) => { let lo = 0, hi = list.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (list[mid].t <= t) lo = mid; else hi = mid - 1; } return list[lo]; };
/** The seeker's place on the sheet at a moment, between the track's points. */
const placeAt = (t) => { const k = track.findIndex((p) => p.t >= t); if (k <= 0) return k === 0 ? track[0] : track.at(-1); const a = track[k - 1], b = track[k], f = (t - a.t) / (b.t - a.t); return { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) }; };

const first = await loadImage(join(dir, frames[0].f)), W = first.width, H = first.height;
/** A lit matrix standing on a sheet point, in the frame's pixels. */
const px = (p) => { const f = toFrame(POSE.under.x + (p.x - POSE.under.x) / LIFT, POSE.under.y + (p.y - POSE.under.y) / LIFT); return { x: f.u * W, y: f.v * W }; };

// the cut: everything the Bolts reach with the margin, widened or lengthened to one by two, inside the frame
const reach = [...seen.map(px), px(Q)];
let x0 = Math.min(...reach.map((p) => p.x)) - MARGIN_PX, x1 = Math.max(...reach.map((p) => p.x)) + MARGIN_PX, y0 = Math.min(...reach.map((p) => p.y)) - MARGIN_PX, y1 = Math.max(...reach.map((p) => p.y)) + MARGIN_PX;
if (y1 - y0 < 2 * (x1 - x0)) { const more = (2 * (x1 - x0) - (y1 - y0)) / 2; y0 -= more; y1 += more; } else { const more = ((y1 - y0) / 2 - (x1 - x0)) / 2; x0 -= more; x1 += more; }
if (y1 - y0 > H) { y0 = 0; y1 = H; const mid = (x0 + x1) / 2; x0 = mid - H / 4; x1 = mid + H / 4; }
if (y0 < 0) { y1 -= y0; y0 = 0; } if (y1 > H) { y0 -= y1 - H; y1 = H; }
if (x0 < 0) { x1 -= x0; x0 = 0; } if (x1 > W) { x0 -= x1 - W; x1 = W; }
const cutW = 2 * Math.round((x1 - x0) / 2), cutH = 2 * Math.round((y1 - y0) / 2);
x0 = Math.round(x0); y0 = Math.round(y0);

const canvas = createCanvas(cutH, cutW), ctx = canvas.getContext('2d');
const shown = frames.map((fr) => ({ ...fr, w: fr.t - lag })).filter((fr) => fr.w >= start.t - 1000 && fr.w <= done.t + 1000);
mkdirSync(dirname(out), { recursive: true });
const ffmpeg = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '20', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const closed = new Promise((resolve, reject) => { ffmpeg.on('close', (code) => (code ? reject(new Error(`ffmpeg ${code}`)) : resolve())); });
let k = 0, img = await loadImage(join(dir, shown[0].f)), pictures = 0;
for (let w = shown[0].w; w <= shown.at(-1).w; w += 1000 * SPEED / FPS, pictures++) {
  while (k + 1 < shown.length && shown[k + 1].w <= w) img = await loadImage(join(dir, shown[++k].f));   // the camera's frame stays until its next
  ctx.setTransform(0, -1, 1, 0, -y0, x0 + cutW);   // a quarter turn against the clock: the sheet's top to the left
  ctx.drawImage(img, 0, 0);
  // the sender's ring, for the level it sent last, fading over the beat
  const send = before(sends, w), q = px(Q);
  if (send.t <= w && w - send.t < 2 * BEAT_MS) {
    ctx.strokeStyle = `rgba(${ORANGE}, ${Math.max(0.25, 1 - 0.75 * (w - send.t) / BEAT_MS).toFixed(2)})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(q.x, q.y, RING_PX + 6 * levels.indexOf(send.strength), 0, 2 * Math.PI); ctx.stroke();
  }
  // the seeker's ring at the track's place for this moment, thin; the reads of the last HOLD_MS on it, a thick quarter per corner that heard
  const here = placeAt(w), at = px(here), heading = (P.heading - before(yaws, w).yaw) * Math.PI / 180;
  const ahead = px({ x: here.x + 10 * Math.sin(heading), y: here.y - 10 * Math.cos(heading) }), nose = Math.atan2(ahead.y - at.y, ahead.x - at.x);
  ctx.strokeStyle = `rgba(${ORANGE}, 0.45)`; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(at.x, at.y, RING_PX, 0, 2 * Math.PI); ctx.stroke();
  for (const r of reads) {
    const age = w - r.t;
    if (age < 0 || age >= HOLD_MS) continue;
    ctx.strokeStyle = `rgba(${ORANGE}, ${(1 - 0.7 * age / HOLD_MS).toFixed(2)})`; ctx.lineWidth = 7;
    r.heard.forEach((heard, c) => { if (!heard) return; const mid = nose + CORNERS[c] * Math.PI / 180; ctx.beginPath(); ctx.arc(at.x, at.y, RING_PX, mid - Math.PI / 4, mid + Math.PI / 4); ctx.stroke(); });
  }
  if (!ffmpeg.stdin.write(await canvas.encode('jpeg', 90))) await once(ffmpeg.stdin, 'drain');
}
ffmpeg.stdin.end();
await closed;
console.log(`${shown.length} frames of the camera in ${pictures} pictures at ${FPS} a second, lag ${lag} ms; the cut ${cutW} x ${cutH} at ${x0}, ${y0} of ${W} x ${H}, the video ${cutH} x ${cutW}, ${(pictures / FPS).toFixed(0)} s; ${reads.filter((r) => r.t >= start.t && r.t <= done.t).length} reads that hit, levels ${levels.join(', ')}`);
