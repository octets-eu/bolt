import type { Referee } from '../referee/referee';
import type { SweepOptions, SweepResult } from './sweep';
import { angleDistance, distance, headingTo, mod360 } from '../helpers/math';
import type { Point } from '../helpers/math';
import { wait } from '../helpers/utils';

export interface SweepTestOptions extends Omit<SweepOptions, 'referee'> {
  /** Where the sender stands, in the seeker's locator frame, cm; the reference points of the floor plan. */
  at: Point;
  /** The walk's direction, a heading in the seeker's locator frame. */
  direction: number;
  /** One step of the walk, cm; the first step is `startCm` when given. */
  stepCm: number;
  startCm?: number | undefined;
  /** What ends the walk besides a miss: a sweep that finds nothing (default), or a miss alone, for a measurement across the bands. */
  until?: 'nothing' | 'miss' | undefined;
  /** The walk also ends after this many trials. */
  trials?: number | undefined;
  /** Both Bolts hard reset at the start (default); false continues from where they stand, in the frames of the last reset. */
  reset?: boolean | undefined;
  /** A sweep is good when its heading is within this of the bearing to the sender, degrees. */
  tolerance: number;
  /** Judge experiments.cleverSweep instead of behavior.sweep. */
  clever?: boolean | undefined;
}

export interface SweepTestTrial {
  n: number;
  /** Where the seeker stood for the sweep, and how far from the sender. */
  position: Point;
  cm: number;
  /** The heading before the sweep, after the random turn. */
  heading: number;
  /** The bearing to the sender from there, by the locator. */
  bearing: number;
  /** The sweep's heading against the bearing; null when the sweep found nothing. */
  error: number | null;
  good: boolean;
  sweep: SweepResult;
}

export interface SweepTestResult {
  /** missed: a sweep's heading was off by more than the tolerance; nothing: a sweep found nothing; done: the trials asked for. */
  reason: 'missed' | 'nothing' | 'done' | 'aborted';
  trials: SweepTestTrial[];
}

/**
 * The sweep behavior judged by the locator instead of the eye: both Bolts
 * start on their reference points, hard reset there unless `reset` is off,
 * so the sender's position is known in the seeker's frame; the referee runs
 * the ladder. A
 * trial: the seeker rolls `stepCm` along `direction`, turns by a random
 * angle, sweeps, and the sweep's heading is compared with the bearing to
 * the sender from the locator's position. Within `tolerance` the next
 * trial follows; a miss, a sweep that finds nothing (unless `until` is
 * 'miss'), the `trials` asked for, or fullstop ends the walk. Each trial is logged as `sweepTest` with its numbers. The truth
 * drifts with yaw and the locator's dead reckoning, more with every step;
 * the position and heading are in the record for a check against the floor.
 */
export function sweepTest (referee: Referee, options: SweepTestOptions): Promise<SweepTestResult> {
  const { seeker, sender } = referee;
  return seeker.run('sweepTest', () => walk(referee, options), { seeker: seeker.name, sender: sender.name, ...options });
}

async function walk (referee: Referee, { at: target, direction, stepCm, startCm = stepCm, tolerance, until = 'nothing', trials: maxTrials = Infinity, reset = true, clever = false, ...sweep }: SweepTestOptions): Promise<SweepTestResult> {

  const showMs = 2000;  // the chevron at the direction found, for the eye, before the next step

  const { seeker, sender } = referee;
  const s = seeker.motion;
  const { status, communication } = seeker;
  const trials: SweepTestTrial[] = [];
  let reason: SweepTestResult['reason'] = 'aborted';

  if (reset) await Promise.all([seeker.lifecycle.reset(), sender.lifecycle.reset()]);
  referee.start();

  try {
    while (!s.aborted) {
      await communication.state('motor', 'cruising');
      await seeker.navigation.roll(trials.length ? stepCm : startCm, direction);
      if (s.aborted) break;
      await seeker.navigation.rotate(Math.round(Math.random() * 360));
      if (s.aborted) break;
      await communication.state('motor', null);
      const heading = status.heading;
      const result = clever ? await seeker.experiments.cleverSweep({ referee, ...sweep }) : await seeker.behavior.sweep({ referee, ...sweep });
      if (s.aborted) break;
      const position = { ...status.position };
      const bearing = Math.round(headingTo(position, target));
      const error = result.heading === null ? null : Math.round(angleDistance(bearing, result.heading));
      const good = error !== null && Math.abs(error) <= tolerance;
      const trial: SweepTestTrial = {
        n: trials.length + 1, position: { x: Math.round(position.x), y: Math.round(position.y) }, cm: Math.round(distance(position, target)),
        heading: mod360(Math.round(heading)), bearing, error, good, sweep: result,
      };
      trials.push(trial);
      seeker.log('info', `sweepTest ${JSON.stringify({ ...trial, sweep: { reason: result.reason, heading: result.heading, used: result.used, hits: result.hits } })}`);
      await communication.state('motor', good ? 'cruising' : 'lost');
      await wait(showMs);
      if (error === null ? until === 'nothing' : !good) {
        reason = error === null ? 'nothing' : 'missed';
        break;
      }
      if (trials.length >= maxTrials) {
        reason = 'done';
        break;
      }
    }
  } finally {
    await communication.state('motor', null);
    await referee.end();
  }
  return { reason, trials };
}
