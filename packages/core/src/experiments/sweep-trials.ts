import type { Bolt } from '../bolt';
import type { SweepOptions, SweepResult } from '../behavior/sweep';
import { wait, whenAborted } from '../helpers/utils';

/**
 * The floor test of the sweep behavior: `sender` sends the ladder while
 * `seeker` sweeps, trial after trial, until fullstop; a step `sweepTrials`
 * of the seeker. A trial begins when the seeker has reported a collision
 * (picked up, set down) and then none for `quietMs`, so it has been placed:
 * it shows the 'i' (armed) and starts on the next report, a tap by hand.
 * At the end it shows the chevron when it points at the direction found,
 * the '?' when the sweep found none, stabilization off, so it can be picked
 * up and placed again. The judge is the eye: whether the chevron points at
 * the sender. Each trial is logged as `sweepTrials` with its result.
 */
export function sweepTrials (seeker: Bolt, sender: Bolt, options: SweepOptions = {}): Promise<SweepResult[]> {
  return seeker.run('sweepTrials', () => trials(seeker, sender, options), { seeker: seeker.name, sender: sender.name, ...options });
}

async function trials (seeker: Bolt, sender: Bolt, options: SweepOptions): Promise<SweepResult[]> {

  const quietMs = 3000;  // no collision report for this long: the seeker stands where it was placed; chosen
  const tap = { xThreshold: 20, yThreshold: 20 };  // a hand's tap gives 20 to 34 (2026-10-10)

  const s = seeker.motion;
  const { communication } = seeker;
  const results: SweepResult[] = [];
  let lastHit = -Infinity, handled = false, armed = false;
  let tapped = (): void => {};
  const offCollision = await seeker.sensors.collision.subscribe(() => {
    lastHit = seeker.now();
    handled = true;
    if (armed) tapped();
  }, tap);
  const sending = sender.communication.sendLadder();
  const aborted = whenAborted(s);

  try {
    while (!s.aborted) {
      // placed: a report (picked up, set down) and then quiet
      while (!s.aborted && (!handled || seeker.now() - lastHit < quietMs)) await Promise.race([wait(handled ? quietMs - (seeker.now() - lastHit) : 200), aborted]);
      if (s.aborted) break;
      const hit = new Promise<void>((resolve) => { tapped = resolve; });
      armed = true;
      await communication.state('motor', null);
      await communication.state('infrared', 'infra-listen');
      seeker.log('info', `sweepTrials armed ${results.length + 1}`);
      await Promise.race([hit, aborted]);
      armed = false;
      if (s.aborted) break;
      const result = await seeker.behavior.sweep(options);
      results.push(result);
      await communication.state('motor', result.heading === null ? 'lost' : 'cruising');
      seeker.log('info', `sweepTrials ${JSON.stringify({ n: results.length, ...result })}`);
      // the next trial waits for the seeker to be handled again
      handled = false;
    }
  } finally {
    await communication.state('motor', null);
    await offCollision();
    sender.abortMotion();
    await sending.catch(() => undefined);
  }
  return results;
}
