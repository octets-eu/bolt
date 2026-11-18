// The survey's tools: a Bolt's place on the sheet from the phone's camera, and
// a drive to a sheet point checked by it. The locator drifts; the camera does
// not, so a point reached by `goto` is the same point on another day.
//
// - `dark` keeps a frame of the scene with every matrix dark. From then on the
//   Bolt under survey shows its matrix in MARKER and is the one patch that got
//   brighter (tracking/glow.ts); no other Bolt may light up or move.
// - `fix` waits LAG_MS, the camera's delay from the floor to a fetched frame
//   (2.8 and 3.1 s measured), takes a frame and answers the Bolt's floor
//   point (tracking/floorcam.ts). The Bolt has to stand that long.
// - `goto` fixes, rolls the distance on the heading by the Bolt's own
//   navigation, fixes again, until within the tolerance. The Bolt's heading
//   frame against the sheet's, `offset`, is learnt from every leg: the first
//   leg, with nothing learnt, is a short probe.
//
// - `spiral` is the survey itself, one routine: the seeker, reset on a point,
//   drives core's `archimedean` behavior around it while the brain's mode by
//   hand listens and reads the corners and the sender sends the long ladder;
//   the run is a path for the bench (`brain path start` to `done`).
//   The seeker's matrix shows the marker the whole way, after LAG_MS of dark
//   at the start, so frames saved beside the run (bench/camrec.mjs) give its
//   true track afterwards; the locator only steers the shape.
//
// - `ladder` is the standing measurement of a ladder: one Bolt sends the codes
//   at their strengths, the other hears them through the brain's observation
//   layer, turning in place; bench/ladder.mjs counts the session's lines.
//
// For the console and the browser tools as `Survey`.

import type { ArchimedeanOptions, ArchimedeanResult, Bolt, LadderRange } from '@bolt/core';
import { mod360, StabilizationIndex } from '@bolt/core';
import { Observation } from '@bolt/brain';
import { glows } from './tracking/glow';
import { boltOnSheet } from './tracking/floorcam';
import { matrixBrain } from './matrix-brain';
import { circuit } from './matrix-brain/connectome';
import { Plotter } from './components/plotter/plotter';

const LAG_MS = 3600;
const MARKER: [number, number, number] = [0, 0, 255];   // blue at full: the largest patch without a clipped pixel
const PROBE_CM = 25, LEARN_CM = 10;   // the first leg's length; a leg at least this long teaches the offset
const OWNER = 'survey';
/** `ladder`: the listener's headings; on each, segments of rounds with a pause between, so one segment's timing does not decide a level's count. */
const HEADINGS = [0, 90, 180, 270], SEGMENTS = 3, ROUNDS = 4, TURN_MS = 1800, PAUSE_MS = 250;
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** The phone's latest frame as pixels. */
async function pixels (): Promise<ImageData> {
  const res = await fetch('/__cam/frame');
  if (!res.ok) throw new Error(`survey: no frame, ${await res.text()}`);
  const bmp = await createImageBitmap(await res.blob());
  const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d')!;
  ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, bmp.width, bmp.height);
}

export interface Fix { x: number; y: number; pixels: number; patches: number }

let before: ImageData | null = null;
/** Sheet heading less the Bolt's own, deg, per Bolt, learnt from its legs. */
const offset: { [name: string]: number } = {};

export const Survey = {

  offset,
  /** The last spiral's or ladder's outcome, for reading after the run. */
  last: null as null | ArchimedeanResult | { frames: number; reads: number; landed: number } | { error: string },

  /**
   * The seeker's spiral around the point it was reset on, the options
   * `archimedean`'s. Both Bolts are reset on their points first (the plotter's
   * buttons); the brain's mode must be off.
   */
  async spiral (seeker: Bolt, sender: Bolt, options: ArchimedeanOptions = {}): Promise<void> {
    Survey.last = null;
    try {
      if (matrixBrain.on) throw new Error('the brain\'s mode is on');
      const from = Plotter.startOf(seeker.name), to = Plotter.startOf(sender.name);
      if (!from || !to) throw new Error('no start on the sheet');
      const at = Plotter.toLocator(seeker.name, to.x, to.y)!;
      await matrixBrain.toggle(false, { seeker: seeker.name, sender: sender.name });
      const { matrix } = seeker.actuators;
      matrix.hold(OWNER);
      await matrix.color([0, 0, 0], OWNER);
      seeker.log('info', `brain path start ${JSON.stringify({ at, sender: sender.name, seeker: seeker.name, spiral: options })}`);
      await wait(LAG_MS + 1000);   // the dark frames
      await matrix.color(MARKER, OWNER);
      const result = await seeker.behavior.archimedean(options);
      await wait(LAG_MS + 1000);   // the camera sees where it ended
      seeker.log('info', `brain path done: spiral ${JSON.stringify(result)}`);
      Survey.last = result;
    } catch (e) {
      Survey.last = { error: String(e) };
      void seeker.actuators.motor.stop().catch(() => {});
    } finally {
      seeker.actuators.matrix.release(OWNER);
      if (matrixBrain.on) await matrixBrain.toggle();
    }
  },

  /**
   * The standing measurement of a ladder. `sender` sends `codes` in turn, one beat each, code k at
   * `strengths[k]`; `listener` hears them as the brain does, through the observation layer with these
   * channels: its listen, its volley of corner reads before every expected frame. Both stand where they
   * were placed, `cm` apart; the listener turns in place through HEADINGS, SEGMENTS of ROUNDS on each.
   * The session carries a `ladder seg` line before each segment and `ladder segend` after it;
   * bench/ladder.mjs counts frames and reads per strength between them. The brain's mode must be off.
   */
  async ladder (sender: Bolt, listener: Bolt, cm: number, strengths: readonly number[] = [2, 4, 8, 16, 32, 64, 128, 255], codes: readonly number[] = strengths.map((_, k) => k)): Promise<void> {
    Survey.last = null;
    const { observation } = circuit, beat = observation.beatMs;
    const obs = new Observation(listener, { ...observation, channels: Object.fromEntries(codes.map((code, k): [number, [LadderRange, number]] => [code, ['long', strengths[k]!]])) });
    let ticks: ReturnType<typeof setInterval> | undefined;
    try {
      if (matrixBrain.on) throw new Error('the brain\'s mode is on');
      await listener.actuators.motor.stabilize(StabilizationIndex.full);
      await obs.start();
      ticks = setInterval(() => { obs.tick({ heading: 0, x: 0, y: 0 }); }, beat);   // the layer's watchdog runs in its tick
      for (const heading of HEADINGS) {
        await listener.actuators.motor.roll(0, heading);
        await wait(TURN_MS);
        for (let seg = 0; seg < SEGMENTS; seg++) {
          listener.log('info', `ladder seg ${JSON.stringify({ cm, sender: sender.name, listener: listener.name, heading, seg, codes, strengths })}`);
          let at = performance.now();
          for (let k = 0; k < ROUNDS * codes.length; k++) {
            await sender.actuators.infrared.send(codes[k % codes.length]!, strengths[k % codes.length]!);
            at += beat;
            await wait(Math.max(0, at - performance.now()));
            if (performance.now() - at > beat) at = performance.now();   // fell behind: the schedule starts again
          }
          await wait(PAUSE_MS);
          listener.log('info', 'ladder segend');
          await wait(PAUSE_MS);
        }
      }
      Survey.last = { frames: obs.stats.frames, reads: obs.stats.reads, landed: obs.stats.landed };
    } catch (e) {
      Survey.last = { error: String(e) };
    } finally {
      clearInterval(ticks);
      await obs.stop();
      void listener.actuators.motor.roll(0, 0).catch(() => {});
    }
  },

  /** Every matrix dark, the scene kept as the frame to compare with; then `bolt` shows the marker. */
  async dark (bolts: Bolt[], bolt: Bolt): Promise<void> {
    for (const b of bolts) await b.actuators.matrix.color([0, 0, 0]);
    await wait(LAG_MS);
    before = await pixels();
    await bolt.actuators.matrix.color(MARKER);
  },

  /** Where `bolt` stands on the sheet, cm; null when the camera shows no patch. The Bolt stands still from the call on. */
  async fix (bolt: Bolt): Promise<Fix | null> {
    if (!before) throw new Error('survey: no dark frame, call dark first');
    await wait(LAG_MS);
    const now = await pixels(), found = glows(now.data, before.data, now.width, now.height), g = found[0];
    if (!g) { bolt.log('info', 'survey fix: no patch'); return null; }
    const s = boltOnSheet(g.x / now.width, g.y / now.width);
    const fix = { x: Math.round(s.x * 10) / 10, y: Math.round(s.y * 10) / 10, pixels: g.n, patches: found.length };
    bolt.log('info', `survey fix ${JSON.stringify(fix)}`);
    return fix;
  },

  /** Drive `bolt` to the sheet point, legs checked by the camera, until within `tolerance` cm or `legs` are spent; the fixes, the last one where it stands. */
  async goto (bolt: Bolt, x: number, y: number, tolerance = 5, legs = 6): Promise<Fix[]> {
    const fixes: Fix[] = [];
    let here = await Survey.fix(bolt);
    for (let leg = 0; here && leg <= legs; leg++) {
      fixes.push(here);
      const dx = x - here.x, dy = y - here.y, d = Math.hypot(dx, dy);
      if (d <= tolerance || leg === legs) break;
      const want = Math.atan2(dx, -dy) * 180 / Math.PI;   // on the sheet, clockwise from its top
      const known = offset[bolt.name] !== undefined;
      const heading = known ? mod360(want - offset[bolt.name]!) : bolt.heading, cm = known ? d : PROBE_CM;
      await bolt.navigation.roll(cm, heading);
      const next = await Survey.fix(bolt);
      if (next) {
        const mx = next.x - here.x, my = next.y - here.y;
        if (Math.hypot(mx, my) >= LEARN_CM) offset[bolt.name] = mod360(Math.atan2(mx, -my) * 180 / Math.PI - heading);
        bolt.log('info', `survey leg ${leg + 1}: ${cm.toFixed(0)} cm on ${heading.toFixed(0)}, moved ${Math.hypot(mx, my).toFixed(1)} cm, offset ${offset[bolt.name]?.toFixed(0) ?? '-'}`);
      }
      here = next;
    }
    return fixes;
  },

};
