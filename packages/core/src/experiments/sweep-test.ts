import type { Bolt } from '../bolt';
import type { SweepOptions, SweepResult } from '../behavior/sweep';
import { angleDistance, distance, headingTo, mod360 } from '../helpers/math';
import type { Point } from '../helpers/math';

export interface SweepTestOptions extends SweepOptions {
  /** Where the sender stands, in the seeker's locator frame, cm; the reference points of the floor plan. */
  at: Point;
  /** The walk's direction, a heading in the seeker's locator frame. */
  direction: number;
  /** One step of the walk, cm. */
  stepCm: number;
  /** A sweep is good when its heading is within this of the bearing to the sender, degrees. */
  tolerance: number;
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
  /** missed: a sweep's heading was off by more than the tolerance; nothing: a sweep found nothing. */
  reason: 'missed' | 'nothing' | 'aborted';
  trials: SweepTestTrial[];
}

/**
 * The sweep behavior judged by the locator instead of the eye: both Bolts
 * start on their reference points, hard reset there, so the sender's
 * position is known in the seeker's frame; the sender sends the ladder. A
 * trial: the seeker rolls `stepCm` along `direction`, turns by a random
 * angle, sweeps, and the sweep's heading is compared with the bearing to
 * the sender from the locator's position. Within `tolerance` the next
 * trial follows; a miss, a sweep that finds nothing, or fullstop ends the
 * walk. Each trial is logged as `sweepTest` with its numbers. The truth
 * drifts with yaw and the locator's dead reckoning, more with every step;
 * the position and heading are in the record for a check against the floor.
 */
export function sweepTest (seeker: Bolt, sender: Bolt, options: SweepTestOptions): Promise<SweepTestResult> {
  return seeker.run('sweepTest', () => walk(seeker, sender, options), { seeker: seeker.name, sender: sender.name, ...options });
}

async function walk (seeker: Bolt, sender: Bolt, { at: target, direction, stepCm, tolerance, ...sweep }: SweepTestOptions): Promise<SweepTestResult> {

  const s = seeker.motion;
  const { status, communication } = seeker;
  const trials: SweepTestTrial[] = [];
  let reason: SweepTestResult['reason'] = 'aborted';

  await Promise.all([seeker.lifecycle.reset(), sender.lifecycle.reset()]);
  const sending = sender.communication.sendLadder();

  try {
    while (!s.aborted) {
      await communication.state('motor', 'cruising');
      await seeker.navigation.roll(stepCm, direction);
      if (s.aborted) break;
      await seeker.navigation.rotate(Math.round(Math.random() * 360));
      if (s.aborted) break;
      await communication.state('motor', null);
      const heading = status.heading;
      const result = await seeker.behavior.sweep(sweep);
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
      if (!good) {
        reason = error === null ? 'nothing' : 'missed';
        break;
      }
    }
  } finally {
    await communication.state('motor', null);
    sender.abortMotion();
    await sending.catch(() => undefined);
  }
  return { reason, trials };
}
