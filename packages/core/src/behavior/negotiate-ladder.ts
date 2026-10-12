import type { Context } from '../context';
import type { Sensors } from '../sensors/sensors';
import { LADDERS } from '../communication/communication';
import type { Ladder, LadderRange } from '../communication/communication';
import type { LadderAuthority } from '../referee/referee';
import { wait, whenAborted } from '../helpers/utils';

export interface NegotiateResult {
  /** confirmed: a frame of the ladder arrived. timeout: none did, the sender is out of reach or abeam; the ladder is returned anyway. */
  reason: 'confirmed' | 'timeout' | 'aborted';
  ladder: Ladder;
  ms: number;
}

/**
 * Ask the referee for the `range` ladder and listen until a frame of it
 * arrives. The ladders send on channels of their own, so the first notify
 * on one of the ladder's channels proves the switch, and a behavior that
 * listens after this measures a ladder that cannot change under it. Every
 * behavior on the infrared starts with this.
 */
export async function negotiateLadder (ctx: Context, sensors: Sensors, referee: LadderAuthority, range: LadderRange, timeoutMs = 4000): Promise<NegotiateResult> {
  const t0 = ctx.now();
  const s = ctx.motion;
  const { channels } = LADDERS[range];
  let heard = (): void => {};
  const frame = new Promise<void>((resolve) => { heard = resolve; });
  const release = await sensors.infrared.subscribe(({ payload }) => {
    if (channels.includes(payload[0] ?? 255)) heard();
    void sensors.listenInfrared(true);
  });
  await sensors.listenInfrared(true);
  const ladder = await referee.ladder(range);
  const reason = await Promise.race([
    frame.then((): NegotiateResult['reason'] => 'confirmed'),
    wait(timeoutMs).then((): NegotiateResult['reason'] => 'timeout'),
    whenAborted(s).then((): NegotiateResult['reason'] => 'aborted'),
  ]);
  await release();
  const ms = ctx.now() - t0;
  ctx.log('info', `negotiateLadder ${JSON.stringify({ range, reason, ms })}`);
  return { reason, ladder, ms };
}
