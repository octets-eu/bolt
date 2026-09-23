import type { Actuators } from '../actuators/actuators';
import type { Context } from '../context';
import type { Sensors } from '../sensors/sensors';
import { distance, headingTo } from '../helpers/math';
import type { Point } from '../helpers/math';
import { StabilizationIndex } from '../protocol/constants';
import { wait } from '../helpers/utils';

export interface ReachResult {
  reason: 'reached' | 'blocked' | 'budget' | 'aborted';
  /** Locator position at the end; when blocked, the point where the obstacle was touched. */
  at: Point;
  contacts: number;
  charges: number;
}

/**
 * Roll to a locator point; where something is in the way, find out whether
 * going on is possible and go over it if it is. Motor commands only, its own
 * loop. Measured basis in research/behaviors.md, reach (2026-09-23):
 *
 * - Contact at exploring speed shows as pitch above 30 degrees held, 8 of 8
 *   at the mat lip and a wall; the locator does not show it, at a wall the
 *   wheels spin and it keeps counting. The contact point is where the pitch
 *   rose, before any spin adds up.
 * - Lip and wall look alike at contact, so the charge is also the test: back
 *   off, charge at 100. The lip was crossed 3 of 3, the wall blocked 2 of 2.
 * - After a charge the ball explores on; a new contact at the same point
 *   means the charge did not get over it. Two such charges: blocked. At a
 *   wall the locator counts the spinning wheels as travel (30 cm in one run),
 *   so a contact before the ball has rolled free since the charge is the same
 *   obstacle whatever the locator says, and the target does not count as
 *   reached until it has.
 * - After a charge the locator is off by an unknown amount (+30 cm of spin
 *   at a wall, -13 cm over the lip), so the obstacle is the reference: when
 *   the ball first rolls free after a charge, its position is set to where
 *   the charge was meant to end, the contact point plus pastCm along the
 *   approach. On 2026-09-23 without this, a ball that glanced off a pillar's
 *   corner after its second charge rolled free with the spin still in the
 *   locator and counted the target reached; set to the contact point itself,
 *   a lip crossing overshot the target by 34 cm. Afterwards the position is
 *   good to about the charge's length, 15 cm.
 *
 * Exploring at 40 was measured on the floor; on the mat 40 does not move the
 * ball, so a ball that does not move steps up to 60, where contact is untested.
 */
export async function reach (ctx: Context, actuators: Actuators, sensors: Sensors, target: Point, tolerance = 5): Promise<ReachResult> {

  const exploreSpeed  = 40;   // command while exploring; contact measured at 40
  const stuckSpeed    = 60;   // when 40 does not move the ball for stuckMs, as on the mat
  const stuckMs       = 1000;
  const contactPitch  = 30;   // degrees; contact is pitch above this, held contactMs
  const contactMs     = 600;
  const backoffCm     = 20;   // run-up for a charge, by the locator from where the back-off starts
  const backSpeed     = 50;
  const chargeSpeed   = 100;
  const pastCm        = 15;   // a charge runs the run-up plus this far, by the locator from where it starts
  const chargeMs      = 2000;
  const samePointCm   = 5;    // a contact this close to the last one is the same obstacle,
  const freeMs        = 1500; // and so is one before the ball has rolled free this long since the charge
  const maxCharges    = 2;    // charges at one point before it counts as blocked
  const settleMs      = 2500; // budget: 2 x (settleMs + distance / cmPerSec), plus chargeBudgetMs per charge
  const cmPerSec      = 10;
  const chargeBudgetMs = 6000;

  ctx.log('info', 'reach.in');

  const s = ctx.motion;
  const release = await sensors.motion.subscribe(null);
  await actuators.motor.stabilize(StabilizationIndex.full);
  await ctx.events.once('sensordata', { timeoutMs: 1000 });

  // the locator plus a correction, set when the ball leaves an obstacle after a charge
  let offset: Point = { x: 0, y: 0 }, reanchor = false;
  const here = (): Point => ({ x: ctx.status.position.x + offset.x, y: ctx.status.position.y + offset.y });
  const pitch = (): number => ctx.status.angles?.pitch ?? 0;
  const t0 = ctx.now();
  let budgetMs = 2 * (settleMs + distance(here(), target) / cmPerSec * 1000);
  let reason: ReachResult['reason'] | null = null;
  let contacts = 0, charges = 0, chargesHere = 0;
  let lastContact: Point | null = null;
  let speed = exploreSpeed, stillSince: number | null = null;
  let pitchSince: number | null = null, pitchAt: Point = here(), approach = 0;
  let rolledFree = 0, lastTick = ctx.now();

  while (reason === null) {
    if (s.aborted) { reason = 'aborted'; break; }
    if (ctx.now() - t0 > budgetMs) { reason = 'budget'; break; }
    const p = here();
    if (distance(p, target) <= tolerance && pitch() < contactPitch && (charges === 0 || rolledFree >= freeMs)) { reason = 'reached'; break; }
    // after a charge the locator may already stand on the target while the ball is at the obstacle: keep the approach until it rolls free
    await actuators.motor.roll(speed, charges > 0 && rolledFree < freeMs ? approach : headingTo(p, target));
    await wait(100);
    const now = ctx.now(), tilt = pitch();
    if (tilt < contactPitch && (ctx.status.speed ?? 0) > 5) {
      rolledFree += now - lastTick;
      if (reanchor && lastContact) {
        const a = approach * Math.PI / 180;
        offset = { x: lastContact.x + pastCm * Math.sin(a) - ctx.status.position.x, y: lastContact.y + pastCm * Math.cos(a) - ctx.status.position.y };
        reanchor = false;
      }
    }
    lastTick = now;

    // a ball that does not move at exploring speed and is not leaning on anything gets more
    if ((ctx.status.speed ?? 0) < 2 && tilt < contactPitch) {
      stillSince ??= now;
      if (now - stillSince > stuckMs && speed < stuckSpeed) speed = stuckSpeed;
    } else stillSince = null;

    if (tilt <= contactPitch) { pitchSince = null; continue; }
    if (pitchSince === null) { pitchSince = now; pitchAt = p; approach = headingTo(p, target); }
    if (now - pitchSince < contactMs) continue;

    // contact at pitchAt
    contacts += 1;
    pitchSince = null;
    const same = lastContact !== null && (distance(pitchAt, lastContact) <= samePointCm || (charges > 0 && rolledFree < freeMs));
    if (!same || !lastContact) { lastContact = pitchAt; chargesHere = 0; }
    if (chargesHere >= maxCharges) { reason = 'blocked'; break; }
    ctx.log('info', `reach: contact ${contacts} at ${Math.round(lastContact.x)},${Math.round(lastContact.y)}, charge ${chargesHere + 1}`);

    // back off against the approach, then charge along it; distances from each phase's own start, since
    // after a charge at a wall the locator has counted the spin and no longer knows where the contact was
    const back = here(), bt = ctx.now();
    while (distance(here(), back) < backoffCm && ctx.now() - bt < 2500 && !s.aborted) {
      await actuators.motor.roll(backSpeed, approach + 180);
      await wait(50);
    }
    await actuators.motor.stop();
    while (!ctx.status.isStill && !s.aborted) await wait(50);
    const from = here(), ct = ctx.now();
    while (distance(here(), from) < backoffCm + pastCm && ctx.now() - ct < chargeMs && !s.aborted) {
      await actuators.motor.roll(chargeSpeed, approach);
      await wait(50);
    }
    charges += 1;
    chargesHere += 1;
    budgetMs += chargeBudgetMs;
    speed = exploreSpeed;
    rolledFree = 0;
    reanchor = true;
    lastTick = ctx.now();
  }

  await actuators.motor.stop();
  while (!ctx.status.isStill) await wait(50);
  await actuators.motor.stabilize(StabilizationIndex.none);
  await release();

  const at = reason === 'blocked' && lastContact ? lastContact : here();
  ctx.log('info', `reach.out: ${reason} at ${Math.round(at.x)},${Math.round(at.y)}, ${contacts} contacts, ${charges} charges`);
  return { reason, at, contacts, charges };
}
