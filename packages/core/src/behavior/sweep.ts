import type { Actuators } from '../actuators/actuators';
import type { Communication } from '../communication/communication';
import { LADDER, ROUND_MS } from '../communication/communication';
import type { Context } from '../context';
import type { Sensors } from '../sensors/sensors';
import { angleDistance, mod360 } from '../helpers/math';
import { StabilizationIndex } from '../protocol/constants';
import { wait } from '../helpers/utils';
import { readVolley, trackBeat } from './beat';
import type { Beat } from './beat';

export interface SweepOptions {
  /** Degrees swept, centred on the heading at the start; 360 goes once round from it. */
  span?: number | undefined;
  /** Degrees between headings. */
  step?: number | undefined;
  /** Reads of the receivers per beat; 0 listens only. */
  reads?: number | undefined;
}

export interface SweepResult {
  /**
   * direction: the axis and its end are known. axis: no hit named an end,
   * the axis is taken as ahead. nothing: no level was heard at some
   * headings and silent at others, the sender is out of reach or on top.
   */
  reason: 'direction' | 'axis' | 'nothing' | 'aborted';
  /** The direction found, a heading; null for nothing and aborted. */
  heading: number | null;
  axis: number | null;
  /** Levels the fit used, as strengths, and the score of the best fit. */
  used: number[];
  fit: number;
  /** Hits that put the sender at the near end of the axis, and at the far end. */
  front: number;
  back: number;
  /** Headings stood at, frames heard per ladder level, volleys read, reads that showed a channel. */
  positions: number;
  levels: number[];
  volleys: number;
  hits: number;
  beat: Beat['counts'];
  seconds: number;
}

interface Hit { channel: number; receivers: number[] }
interface Position { target: number; heading: number; frames: number[]; volleys: number; hits: Hit[] }

/**
 * Where another Bolt is, from a standing turn. The other Bolt sends the
 * ladder (Communication.sendLadder); this one turns through `span` degrees
 * in steps of `step`, stands one ladder round at each heading and counts
 * the frames per level. Motor commands only, its own loop. Measured basis:
 * the pass-by of 2026-10-05, the seek-edge runs of 2026-10-10/11 and the
 * sweep trials of 2026-10-11; the record is Behaviour.md in the vault.
 *
 * - A level that is just arriving is heard with the sender within about 60
 *   degrees of the fore-aft axis, either end, and not abeam: at 1.0 to
 *   1.6 m strength 4 in 36 % of the rounds ahead, 6 % abeam, 73 % behind.
 *   A stronger level is heard all round, a weaker one not at all; which
 *   level is the one just arriving depends on the distance, see LADDER.
 * - So the axis is the direction whose two lobes, `half` degrees each side
 *   of it and of its opposite, fit the heard and silent headings best,
 *   summed over every level heard at `heardMin` headings or more and silent
 *   at `silentMin` or more; a level heard everywhere or nowhere says
 *   nothing. A frame outside the lobes counts twice as much against a
 *   candidate as a silence inside, which dropped frames give at every level
 *   (strength 4 at 1.5 m arrives in 10 to 50 % of its rounds inside the
 *   lobe). Frames decide, a single silence never: the standing start of
 *   seekEdge, which declared the lobe's edge on the first silence, did so
 *   inside the lobe in 5 of 8 runs. Candidates that score alike are
 *   averaged, so the axis is finer than the `step` between headings.
 * - Ahead or behind on the axis the notifies cannot say: the rear lobe
 *   hears as well as the front one (85 % against 56 % at 1.3 m). The
 *   receivers can. A read of them lands in a frame when it is timed to the
 *   sender's beat (beat.ts), and the four sit at the corners, 45 degrees
 *   off the nose in front and 135 behind, so a hit puts the sender within a
 *   quadrant of the heading plus the mean of the corners that heard. The
 *   end of the axis nearer to that takes the hit; the end with more hits is
 *   the direction. Hits come 0 to 8 per sweep, more close in; without one
 *   the axis is taken as ahead.
 * - The motion stream runs only while the ball turns, the heading is read
 *   at the end of each turn. The notifies scatter 20 to 25 ms around the
 *   beat whatever the stream does, which caps the hits at 10 to 20 % of the
 *   volleys; the cause is open.
 *
 * Shows 'tracking' while it runs. Ends pointing at the direction found, or
 * where the sweep ended when there is none, stabilization off. Ends on
 * fullstop. Records `sweep start` with the constants, one `sweep` line per
 * heading with the frames and the hits, `sweep axis` with the fit and the
 * vote.
 */
export async function sweep (ctx: Context, actuators: Actuators, sensors: Sensors, communication: Communication, { span = 180, step = 15, reads = 3 }: SweepOptions = {}): Promise<SweepResult> {

  const roundMs   = ROUND_MS;
  const turnMs    = 600;    // a step's turn and its swing; as in seekEdge
  const firstMs   = 1000;   // the turn to the first heading and the one to the direction found, up to 180 degrees
  const msBefore  = 45;     // a volley's centre before the expected notify; infrared-timing run 5
  const stepMs    = 6;      // between the reads of a volley; infrared-timing run 5
  const half      = 60;     // half-width of a lobe, degrees; the pass-by and the seek-edge runs
  const heardMin  = 3;      // headings a level is heard at, at least, to be fitted; fewer is stray frames; chosen
  const silentMin = 2;      // and silent at, at least; strength 16 at 2 m had two; chosen
  /** Where the receivers sit, degrees off the nose: front left, front right, back right, back left. */
  const corners   = [-45, 45, 135, -135];
  const names     = ['FL', 'FR', 'BR', 'BL'];

  const s = ctx.motion;
  const { status } = ctx;
  const { motor } = actuators;
  const t0 = ctx.now();
  const heading = (): number => mod360(-(status.angles?.yaw ?? 0));

  const heardRound = LADDER.map(() => 0);
  const levels = LADDER.map(() => 0);
  const positions: Position[] = [];
  let volleys = 0, hits = 0;

  const beat = await trackBeat(sensors, LADDER.map((_, channel) => channel), (channel) => {
    heardRound[channel] = (heardRound[channel] ?? 0) + 1;
    levels[channel] = (levels[channel] ?? 0) + 1;
  });
  await communication.state('infrared', 'tracking');
  await motor.stabilize(StabilizationIndex.full);

  /** Turn to `target` and give it `ms`, the motion stream held that long; the heading at the end. */
  const pose = async (target: number | null, ms: number): Promise<number> => {
    const release = await sensors.motion.subscribe(null);
    if (target !== null) await motor.roll(0, target);
    await wait(ms);
    const at = heading();
    await release();
    return at;
  };

  const start = await pose(null, turnMs);
  const count = span >= 360 ? Math.round(360 / step) : Math.floor(span / step) + 1;
  const first = span >= 360 ? start : start - span / 2;
  const lead = msBefore + stepMs * (reads - 1) / 2;
  ctx.log('info', `sweep start ${JSON.stringify({ ladder: LADDER, span, step, reads, count, start: Math.round(start), roundMs, turnMs, firstMs, msBefore, stepMs, half, heardMin, silentMin })}`);

  for (let n = 0; n < count && !s.aborted; n++) {
    const target = mod360(first + n * step);
    const position: Position = { target, heading: await pose(target, n === 0 ? firstMs : turnMs), frames: [], volleys: 0, hits: [] };
    heardRound.fill(0);
    const tr = performance.now();
    while (performance.now() - tr < roundMs && !s.aborted) {
      const at = reads > 0 ? beat.next(performance.now() + lead + 12) : null;
      if (at === null) {
        await wait(50);
        continue;
      }
      const payloads = await readVolley(ctx, at - lead, reads, stepMs);
      position.volleys++;
      for (const payload of payloads) {
        if (payload === null) continue;
        for (const channel of new Set(payload.filter(c => c < LADDER.length))) {
          position.hits.push({ channel, receivers: corners.map((_, i) => i).filter(i => payload[i] === channel) });
        }
      }
    }
    position.frames = [...heardRound];
    volleys += position.volleys;
    hits += position.hits.length;
    positions.push(position);
    ctx.log('info', `sweep ${JSON.stringify({
      n, target: Math.round(target), heading: Math.round(position.heading), frames: position.frames, volleys: position.volleys,
      hits: position.hits.map(h => `${LADDER[h.channel]}:${h.receivers.map(i => names[i]).join('+')}`),
    })}`);
  }

  // the axis: the fit of two lobes to the heard and silent headings over the levels heard at some and silent at others;
  // an axis is a line, so the candidates run to 180 and the ones that score alike are averaged on a 180 degree circle
  const heardAt = LADDER.map((_, k) => positions.filter(p => (p.frames[k] ?? 0) > 0).length);
  const used = LADDER.map((_, k) => k).filter(k => (heardAt[k] ?? 0) >= heardMin && positions.length - (heardAt[k] ?? 0) >= silentMin);
  let axis: number | null = null, fit = 0;
  if (used.length && !s.aborted) {
    const best: number[] = [];
    fit = -Infinity;
    for (let d = 0; d < 180; d++) {
      let score = 0;
      for (const p of positions) {
        const off = Math.abs(angleDistance(d, p.heading));
        const inside = off <= half || off >= 180 - half;
        for (const k of used) score += (p.frames[k] ?? 0) > 0 ? (inside ? 1 : -2) : (inside ? -0.5 : 1);
      }
      if (score > fit + 1e-9) {
        fit = score;
        best.length = 0;
      }
      if (score >= fit - 1e-9) best.push(d);
    }
    let sx = 0, sy = 0;
    for (const d of best) {
      sx += Math.cos(d * Math.PI / 90);
      sy += Math.sin(d * Math.PI / 90);
    }
    axis = Math.round(mod360(Math.atan2(sy, sx) * 90 / Math.PI) * 10) / 10;
  }

  // the vote: the corners that heard put the sender within a quadrant of the heading plus their mean; the nearer end of the axis takes the hit
  let front = 0, back = 0;
  const bearings: number[] = [];
  if (axis !== null) {
    for (const p of positions) {
      for (const hit of p.hits) {
        let sx = 0, sy = 0;
        for (const i of hit.receivers) {
          sx += Math.cos((corners[i] ?? 0) * Math.PI / 180);
          sy += Math.sin((corners[i] ?? 0) * Math.PI / 180);
        }
        // opposite corners, or all four, name no side
        if (Math.hypot(sx, sy) < 0.5) continue;
        const bearing = mod360(p.heading + Math.atan2(sy, sx) * 180 / Math.PI);
        bearings.push(Math.round(bearing));
        if (Math.abs(angleDistance(axis, bearing)) < 90) front++;
        else back++;
      }
    }
  }
  const reason: SweepResult['reason'] = s.aborted ? 'aborted' : axis === null ? 'nothing' : front === back ? 'axis' : 'direction';
  const direction = axis === null || s.aborted ? null : back > front ? mod360(axis + 180) : axis;
  ctx.log('info', `sweep axis ${JSON.stringify({ heardAt, used: used.map(k => LADDER[k]), fit, axis, bearings, front, back, reason, heading: direction })}`);

  if (direction !== null) {
    await motor.roll(0, direction);
    await wait(firstMs);
  }
  await motor.stop();
  await motor.stabilize(StabilizationIndex.none);
  await communication.state('infrared', null);
  await beat.release();

  return {
    reason, heading: direction, axis,
    used: used.map(k => LADDER[k] ?? 0), fit, front, back,
    positions: positions.length, levels, volleys, hits, beat: beat.counts,
    seconds: Math.round((ctx.now() - t0) / 100) / 10,
  };
}
