// replay: a recorded run through an estimator, scored against the truth.
//
// A session file holds, for the seeker, every infrared notify (the channel
// that arrived), every corner read with its reply, and the motion stream
// with yaw and locator at 20 Hz; the sweep and approach tests log the
// sender's place in the seeker's locator frame at their `.in` line and per
// trial the position, heading and bearing they measured. From that the true
// bearing of the sender off the nose is known at every moment, and any
// estimator that takes the same events can be run over the run, as often
// as wanted, without a Bolt. The locator's slip is the truth's error bar.
//
//   npx tsx packages/core/src/experiments/replay.mjs <zip>:<member>|<file.jsonl> ... [--check] [--estimator network|accumulator]
//   npx tsx packages/core/src/experiments/replay.mjs --list            runs in every zip of sessions/
//   npx tsx packages/core/src/experiments/replay.mjs <runs> --senses [--bands 50,120]   the senses against the truth
//
// --check prints, per trial the test logged, the locator and heading the
// stream had at that moment beside the test's own numbers; the positions
// agree, the tests' headings sit 90° off the stream's (see headingOffset).
// --senses tabulates the corner reads and the frames per channel against
// the sender's true sector, the check of the frame and of what the senses
// carry, no estimator involved.
//
// Events to an estimator, in time order: { t, type: 'motion', heading, x, y, speed }
// (t in ms, heading clockwise from the locator's +y, the brain's convention),
// { t, type: 'frame', channel }, { t, type: 'read', payload } (four corner
// values, 255 for none). It answers `estimate()` with { angle, length }:
// the believed bearing off the nose, clockwise, and its confidence.
//
// Score per run, from one estimate a second: lock = the first second from
// which the error stays under LOCK_DEG for LOCK_S seconds; then the share
// of seconds under LOCK_DEG, the mean absolute error, the mean length.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { network } from './replay-network.mjs';
import { accumulator } from './replay-accumulator.mjs';

const LOCK_DEG = 30, LOCK_S = 3;
const RUNS = /^(sweepTest|approachTest)\.(in|out)|^brain (seek)(:| found| time| runaway| stopped)|^brain (path) (start|done)/;
/** A path run (the mode by hand, the seeker driven by its navigation from the plan's starts): the sender 23 cm behind the reset, in the seeker's locator frame. */
const PATH_AT = { x: 0, y: -23 };
/**
 * The browser's seek runs count only when the user marked them good: the
 * `brain replay {seeker, sender, at, startCm, result, seconds}` line after
 * the run's end, `at` the sender's place in the seeker's locator frame from
 * the sheet starts. Unmarked seeks are dropped.
 */
const MARK = /^brain replay (\{.*\})$/;
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };

const specs = args.filter((a, i) => !a.startsWith('--') && !['--estimator', '--offset', '--param', '--bands'].includes(args[i - 1] ?? ''));
const mod360 = (a) => ((a % 360) + 360) % 360;
const angDiff = (a, b) => { const d = mod360(a - b); return d > 180 ? d - 360 : d; };

/** The lines of a session file: `zip:member` or a plain path. */
function load (spec) {
  const i = spec.indexOf(':');
  const text = i > 0 && spec.slice(i - 4, i) === '.zip' ? execFileSync('unzip', ['-p', spec.slice(0, i), spec.slice(i + 1)], { encoding: 'utf8', maxBuffer: 1 << 30 }) : readFileSync(spec, 'utf8');
  const out = [];
  for (const line of text.split('\n')) { if (!line) continue; try { out.push(JSON.parse(line)); } catch { /* a torn line */ } }
  return out;
}

/** The runs in the lines: each with its name, the seeker, the sender's place `at`, and the lines between `.in` and `.out`. */
function runs (lines) {
  const out = [];
  let cur = null;
  for (const e of lines) {
    const d = e.data;
    if (e.name === 'info' && typeof d === 'string' && RUNS.test(d)) {
      const m = d.match(RUNS);
      const name = m[1] ?? m[3] ?? m[5], step = m[2] ?? (m[4] === ':' ? 'in' : m[4] ? 'out' : m[6] === 'start' ? 'in' : 'out');
      if (step === 'in' && name === 'path') {
        cur = { name, t0: e.t, seeker: e.bolt, sender: null, at: PATH_AT, args: { direction: 0 }, lines: [], trials: [] };
      } else if (step === 'in' && name === 'seek') {
        // brain seek: seeker SB-9129 on sender SB-11DF, ... (the matrix-brain mode of the browser app); `at` comes with the mark
        const who = d.match(/seeker (\S+) on sender (\S+)/);
        cur = { name, t0: e.t, seeker: who?.[1], sender: who?.[2], at: null, args: { direction: 0 }, lines: [], trials: [] };
      } else if (step === 'in') {
        const json = d.slice(d.indexOf('{'));
        let a = {}; try { a = JSON.parse(json); } catch { /* keep going */ }
        cur = { name, t0: e.t, seeker: a.seeker, sender: a.sender, at: a.at ?? null, args: a, lines: [], trials: [] };
      } else if (cur) {
        const json = d.slice(d.indexOf('{'));
        try { cur.result = json.startsWith('{') ? JSON.parse(json) : { text: d }; } catch { cur.result = null; }
        cur.t1 = e.t; out.push(cur); cur = null;
      }
      continue;
    }
    if (e.name === 'info' && typeof d === 'string' && MARK.test(d) && out.length) {
      // the mark follows its run: the last seek gets the user's verdict and its truth
      const last = out.at(-1);
      if (last.name === 'seek' && !last.at) { try { const mk = JSON.parse(d.match(MARK)[1]); last.at = mk.at ?? null; last.mark = mk; } catch { /* no mark */ } }
      continue;
    }
    if (cur) cur.lines.push(e);
  }
  return out;
}

/** The seeker's events of a run, in order. */
function events (run) {
  const out = [];
  for (const e of run.lines) {
    if (e.bolt !== run.seeker) continue;
    const d = e.data;
    if (e.name === 'sensordata' && d?.sensordata?.angles) {
      const s = d.sensordata, L = s.locator ?? {};
      out.push({ t: e.t, type: 'motion', heading: mod360(-s.angles.yaw), x: L.positionX ?? 0, y: L.positionY ?? 0, speed: Math.hypot(L.velocityX ?? 0, L.velocityY ?? 0) });
    } else if (e.name === 'infrared' && d?.msg?.payload) {
      out.push({ t: e.t, type: 'frame', channel: d.msg.payload[0] });
    } else if (e.name === 'ack' && d?.msg?.device === 24 && d?.msg?.command === 34 && d.msg.payload?.length === 4) {
      out.push({ t: e.t, type: 'read', payload: d.msg.payload });
    }
  }
  return out;
}

/**
 * True bearing of the sender off the nose, from the latest motion sample and
 * the sender's place in the locator frame. The stream's yaw counts from the
 * yaw reset a run begins with, the locator frame does not: `offset` is the
 * locator-frame heading less the stream's, measured by `headingOffset`.
 */
const truth = (m, at, offset = 0) => mod360(Math.atan2(at.x - m.x, at.y - m.y) * 180 / Math.PI - (m.heading + offset));

/** The test's trial lines, `sweepTest {n, position, heading, bearing}` and the like, with their times. */
function trials (run) {
  const out = [];
  for (const e of run.lines) {
    if (e.name !== 'info' || typeof e.data !== 'string' || !/^(sweepTest|approachTest) \{/.test(e.data)) continue;
    try { out.push({ t: e.t, ...JSON.parse(e.data.slice(e.data.indexOf('{'))) }); } catch { /* not a trial */ }
  }
  return out;
}

/**
 * Locator-frame heading less the stream's heading. Zero: with it the
 * corner reads of the 18 runs of 2026-10 land on their nominal angles, FL
 * at 315, FR at 0 to 45, BR at 135, BL at 180 to 225, and the weak rungs
 * are heard ahead and behind and fall silent abeam, as pass-by measured;
 * with the +-90 the tests' own trial `heading` lines imply, every sense is
 * off by a quarter turn (2026-11-08, `--senses --offset`). `--offset N`
 * forces another value, to test a frame against the senses.
 */
function headingOffset () {
  return opt('--offset') !== undefined ? Number(opt('--offset')) : 0;
}

function score (run, estimator) {
  const ev = events(run);
  if (!run.at || !ev.length) return null;
  const offset = headingOffset();
  let m = null, nextSec = ev[0].t + 1000;
  const secs = [];
  let frames = 0, reads = 0, hits = 0;
  for (const e of ev) {
    if (e.type === 'motion') m = e;
    if (e.type === 'frame') frames++;
    if (e.type === 'read') { reads++; if (e.payload.some((v) => v !== 255)) hits++; }
    estimator.step(e);
    while (e.t >= nextSec) {
      if (m) {
        const est = estimator.estimate(); const tr = truth(m, run.at, offset); const t = (nextSec - ev[0].t) / 1000;
        secs.push({ t, err: Math.abs(angDiff(est.angle, tr)), length: est.length, truth: tr, dErr: est.distance === undefined ? null : est.distance - Math.hypot(run.at.x - m.x, run.at.y - m.y) });
        if (flag('--dump') && t % 10 === 0 && estimator.debug) console.log(`    ${t} s truth ${tr.toFixed(0)} est ${est.angle.toFixed(0)} ${estimator.debug()}`);
        // --trace: every second the truth and the estimate side by side, bearing and distance, with the Bolt's heading
        if (flag('--trace')) console.log(`    ${String(t).padStart(4)} s  truth ${String(tr.toFixed(0)).padStart(3)}° ${String(Math.hypot(run.at.x - m.x, run.at.y - m.y).toFixed(0)).padStart(4)} cm  |  belief ${String(mod360(est.angle).toFixed(0)).padStart(3)}°${est.distance !== undefined ? ` ${String(est.distance.toFixed(0)).padStart(4)} cm` : ''}  len ${est.length.toFixed(2)}  heading ${m.heading.toFixed(0)}`);
      }
      nextSec += 1000;
    }
  }
  let lock = null;
  for (let i = 0; i + LOCK_S <= secs.length; i++) {
    if (secs.slice(i, i + LOCK_S).every((s) => s.err < LOCK_DEG)) { lock = secs[i].t; break; }
  }
  const after = lock === null ? [] : secs.filter((s) => s.t >= lock);
  const mean = (a, f) => (a.length ? a.reduce((x, s) => x + f(s), 0) / a.length : NaN);
  return { offset, seconds: secs.length, frames, reads, hits, lock, lockedShare: after.length ? after.filter((s) => s.err < LOCK_DEG).length / after.length : 0, meanErr: mean(secs, (s) => s.err), meanLen: mean(secs, (s) => s.length), secs };
}

/**
 * Per trial the test logged (its own `sweepTest {n, position, heading, bearing}`
 * line, timestamped), the stream's locator and heading at that moment beside
 * the test's numbers; `rel` is the test's bearing less its heading, the
 * truth as the test saw it, to agree with `truth` here.
 */
function check (run) {
  const ev = events(run).filter((e) => e.type === 'motion');
  const trs = trials(run), offset = headingOffset();
  console.log(`  ${run.name} ${run.seeker} sender at (${run.at?.x?.toFixed(0)}, ${run.at?.y?.toFixed(0)}), ${trs.length} trials, heading offset ${offset.toFixed(0)}° (the tests' own heading is 90° off, see headingOffset)`);
  for (const tr of trs) {
    const m = ev.filter((x) => x.t <= tr.t).at(-1);
    if (m) console.log(`    trial ${tr.n}: test position (${tr.position?.x}, ${tr.position?.y}) heading ${tr.heading} bearing ${tr.bearing} rel ${mod360(tr.bearing - tr.heading).toFixed(0)} | stream locator (${m.x.toFixed(0)}, ${m.y.toFixed(0)}) heading ${m.heading.toFixed(0)} truth ${truth(m, run.at, offset).toFixed(0)}`);
  }
}

/**
 * The senses against the truth, no estimator: per corner named by a landed
 * read, where the sender really was, in 8 sectors of 45° about the nose
 * (sector 0 is -22.5 to 22.5); per channel, the frames heard by the sender's
 * sector; the share of all 20 Hz samples by sector as the exposure.
 */
/** Distance bands for the senses, cm: 0-20, 20-40, ... 180-200, 200 and more. */
const BANDS = 11, BAND_CM = 20;
const band = (m, at) => Math.min(BANDS - 1, Math.floor(Math.hypot(at.x - m.x, at.y - m.y) / BAND_CM));

function senses (run, acc) {
  const ev = events(run);
  const offset = headingOffset();
  const sector = (a) => Math.round(mod360(a) / 45) % 8;
  let m = null;
  for (const e of ev) {
    if (e.type === 'motion') { m = e; const sec = sector(truth(m, run.at, offset)), b = band(m, run.at); acc.exposure[sec]++; acc.distExposure[b]++; acc.bandExposure[b][sec]++; continue; }
    if (!m) continue;
    const sec = sector(truth(m, run.at, offset)), b = band(m, run.at);
    if (e.type === 'frame') {
      (acc.frames[e.channel] ??= new Array(8).fill(0))[sec]++; (acc.dist[e.channel] ??= new Array(BANDS).fill(0))[b]++;
      ((acc.bandFrames[e.channel] ??= Array.from({ length: BANDS }, () => new Array(8).fill(0)))[b])[sec]++;
    } else if (e.type === 'read') {
      const names = ['FL', 'FR', 'BR', 'BL'];
      const heard = names.filter((_, i) => e.payload[i] !== 255);
      if (heard.length === 4) acc.corners.flooded[sec]++;
      else for (const c of heard) { acc.corners[c][sec]++; acc.bandCorners[c][b][sec]++; }
    }
  }
}

if (flag('--senses')) {
  const grid = () => Array.from({ length: BANDS }, () => new Array(8).fill(0));
  const acc = { exposure: new Array(8).fill(0), frames: {}, corners: { FL: new Array(8).fill(0), FR: new Array(8).fill(0), BR: new Array(8).fill(0), BL: new Array(8).fill(0), flooded: new Array(8).fill(0) }, distExposure: new Array(BANDS).fill(0), dist: {},
    bandExposure: grid(), bandFrames: {}, bandCorners: { FL: grid(), FR: grid(), BR: grid(), BL: grid() } };
  for (const spec of specs) for (const r of runs(load(spec)).filter((x) => x.at)) senses(r, acc);
  const row = (name, a) => `${name.padEnd(10)} ${a.map((v) => String(v).padStart(6)).join('')}  ${String(a.reduce((x, y) => x + y, 0)).padStart(7)}`;
  console.log(`sector:    ${['0', '45', '90', '135', '180', '225', '270', '315'].map((v) => v.padStart(6)).join('')}    total   (sender's true bearing off the nose, clockwise)`);
  console.log(row('exposure', acc.exposure));
  for (const c of ['FL', 'FR', 'BR', 'BL', 'flooded']) console.log(row(`read ${c}`, acc.corners[c]));
  for (const ch of Object.keys(acc.frames).sort()) console.log(row(`frame ch${ch}`, acc.frames[ch]));
  // by distance: frames per second of exposure in each band, the level's range profile
  const drow = (name, a) => `${name.padEnd(10)} ${a.map((v) => String(v).padStart(6)).join('')}`;
  console.log(`\ndistance:  ${Array.from({ length: BANDS }, (_, i) => (i === BANDS - 1 ? `${i * BAND_CM}+` : `${i * BAND_CM}`).padStart(6)).join('')}   (cm to the sender; frames per second of exposure)`);
  console.log(drow('exposure s', acc.distExposure.map((v) => Math.round(v / 20))));
  for (const ch of Object.keys(acc.dist).sort()) console.log(drow(`frame ch${ch}`, acc.dist[ch].map((v, i) => (acc.distExposure[i] ? (v / (acc.distExposure[i] / 20)).toFixed(2) : '-'))));
  // by sector within bands of distance, `--bands 50,120`: the sector profile of each channel and corner, near and far apart;
  // counts and seconds of exposure, so the builder can take them as they are
  if (opt('--bands')) {
    const edges = opt('--bands').split(',').map(Number), lo = [0, ...edges], hi = [...edges, Infinity];
    const sum = (rows) => rows.reduce((a, r) => a.map((v, i) => v + r[i]), new Array(8).fill(0));
    const within = (g, k) => sum(g.filter((_, b) => b * BAND_CM >= lo[k] && b * BAND_CM < hi[k]));
    for (let k = 0; k < lo.length; k++) {
      console.log(`\nband ${lo[k]}-${hi[k] === Infinity ? '' : hi[k]} cm:  ${['0', '45', '90', '135', '180', '225', '270', '315'].map((v) => v.padStart(6)).join('')}    total`);
      console.log(row('exposure s', within(acc.bandExposure, k).map((v) => Math.round(v / 20))));
      for (const c of ['FL', 'FR', 'BR', 'BL']) console.log(row(`read ${c}`, within(acc.bandCorners[c], k)));
      for (const ch of Object.keys(acc.bandFrames).sort()) console.log(row(`frame ch${ch}`, within(acc.bandFrames[ch], k)));
    }
  }
  process.exit(0);
}

if (flag('--list')) {
  for (const zip of readdirSync('sessions').filter((f) => f.endsWith('.zip'))) {
    const members = execFileSync('unzip', ['-Z1', `sessions/${zip}`], { encoding: 'utf8' }).split('\n').filter((m) => m.endsWith('.jsonl'));
    for (const member of members) {
      const rs = runs(load(`sessions/${zip}:${member}`));
      for (const r of rs) if (r.at) console.log(`sessions/${zip}:${member}  ${r.name}  ${r.seeker} <- ${r.sender} at (${r.at.x.toFixed(0)}, ${r.at.y.toFixed(0)})  ${((r.t1 - r.t0) / 1000).toFixed(0)} s`);
    }
  }
  process.exit(0);
}

const ESTIMATORS = { network, accumulator };
if (!specs.length) { console.error('usage: replay.mjs <zip>:<member>|<file.jsonl> ... [--check] [--estimator network] | --list'); process.exit(1); }
/** `--param tauMs=60000,wCorner=10`: the estimator's parameters, numbers. */
const params = Object.fromEntries((opt('--param', '') || '').split(',').filter(Boolean).map((kv) => { const [k, v] = kv.split('='); return [k, Number(v)]; }));
const make = () => ESTIMATORS[opt('--estimator', 'network')](params);
if (!ESTIMATORS[opt('--estimator', 'network')]) { console.error(`no estimator ${opt('--estimator')}; have ${Object.keys(ESTIMATORS).join(', ')}`); process.exit(1); }
const all = [];
for (const spec of specs) {
  const rs = runs(load(spec)).filter((r) => r.at);
  for (const r of rs) {
    if (flag('--check')) { check(r); continue; }
    const s = score(r, make());
    if (!s) continue;
    all.push(s);
    console.log(`  ${r.name} ${r.seeker} at (${r.at.x.toFixed(0)}, ${r.at.y.toFixed(0)}) offset ${s.offset.toFixed(0)}°: ${s.seconds} s, ${s.frames} frames, ${s.hits}/${s.reads} reads hit; lock ${s.lock === null ? 'never' : s.lock + ' s'}, locked share ${(s.lockedShare * 100).toFixed(0)} %, mean |err| ${s.meanErr.toFixed(0)}°, mean len ${s.meanLen.toFixed(2)}`);
  }
}
if (all.length) {
  const locks = all.map((s) => s.lock).filter((l) => l !== null).sort((a, b) => a - b);
  const secs = all.flatMap((s) => s.secs);
  const mean = (a, f) => a.reduce((x, v) => x + f(v), 0) / a.length;
  // the error by time since the run's start: does it keep falling as frames accumulate
  const buckets = [[0, 10], [10, 30], [30, 60], [60, 120], [120, 1e9]];
  console.log('  |err| by time since start: ' + buckets.map(([a, b]) => { const x = secs.filter((v) => v.t >= a && v.t < b); return x.length ? `${a}-${b === 1e9 ? '' : b} s ${mean(x, (v) => v.err).toFixed(0)}° (${(100 * x.filter((v) => v.err < LOCK_DEG).length / x.length).toFixed(0)} %)` : ''; }).filter(Boolean).join(', '));
  console.log(`${opt('--estimator', 'network')}${opt('--param') ? ' ' + opt('--param') : ''}: ${all.length} runs, ${secs.length} s; locked ${locks.length} of ${all.length}, median lock ${locks.length ? locks[Math.floor(locks.length / 2)] : '-'} s; `
    + `seconds under ${LOCK_DEG}°: ${(100 * secs.filter((x) => x.err < LOCK_DEG).length / secs.length).toFixed(0)} %; mean |err| ${mean(secs, (x) => x.err).toFixed(0)}°; mean len ${mean(secs, (x) => x.length).toFixed(2)}`
    + (secs.some((x) => x.dErr !== null) ? `; distance: mean ${mean(secs.filter((x) => x.dErr !== null), (x) => x.dErr).toFixed(0)} cm off, mean |off| ${mean(secs.filter((x) => x.dErr !== null), (x) => Math.abs(x.dErr)).toFixed(0)} cm` : ''));
}
