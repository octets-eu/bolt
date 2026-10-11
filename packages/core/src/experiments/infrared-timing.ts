import type { Bolt } from '../bolt';
import { readVolley, trackBeat } from '../behavior/beat';
import type { Beat } from '../behavior/beat';
import { wait } from '../helpers/utils';

export interface TimedReadsResult {
  volleys: number;
  /** Volleys in which at least one read showed the channel. */
  read: number;
  /** Per position in the volley, how often that read showed the channel. */
  perRead: number[];
  /** Which receivers showed the channel, e.g. "FL+FR", and how often. */
  receivers: Record<string, number>;
  beat: Beat['counts'];
}

/**
 * The run of 2026-10-04 that measured how often a read of the receivers
 * (0x22) lands in a frame when it is timed to the sender's beat. The
 * findings and the primitives, the beat tracker and the volley, are in
 * behavior/beat.ts; the record is the vault note "2026-10-04 Infrared
 * timing". `sender` sends `channel` at `strength` every 200 ms, `reader`
 * learns the beat and on every beat reads `count` times, `stepMs` apart,
 * centred `msBefore` ms before the expected notify. Ends after `volleys`
 * beats or on the reader's fullstop; null when the beat is not learned
 * within 10 s.
 */
export async function timedReads (
  reader: Bolt, sender: Bolt,
  { channel = 2, strength = 4, volleys = 180, count = 3, stepMs = 6, msBefore = 45 } = {},
): Promise<TimedReadsResult | null> {
  const s = reader.motion;
  const names = ['FL', 'FR', 'BR', 'BL'];

  let sending = true;
  const sent = (async (): Promise<void> => {
    while (sending && !s.aborted) {
      const t = performance.now();
      await sender.actuators.infrared.send(channel, strength);
      await wait(Math.max(0, 200 - (performance.now() - t)));
    }
  })();

  const beat = await trackBeat(reader.sensors, [channel]);
  const t0 = performance.now();
  while (beat.next(performance.now()) === null && performance.now() - t0 < 10000 && !s.aborted) await wait(50);
  if (beat.next(performance.now()) === null) {
    await beat.release();
    sending = false;
    await sent;
    return null;
  }

  const result: TimedReadsResult = { volleys: 0, read: 0, perRead: new Array<number>(count).fill(0), receivers: {}, beat: beat.counts };
  const lead = msBefore + stepMs * (count - 1) / 2;
  while (result.volleys < volleys && !s.aborted) {
    const at = beat.next(performance.now() + lead + 12);
    if (at === null) break;
    const payloads = await readVolley(reader, at - lead, count, stepMs);
    result.volleys++;
    let any = false;
    payloads.forEach((payload, k) => {
      if (payload === null || !payload.includes(channel)) return;
      any = true;
      result.perRead[k] = (result.perRead[k] ?? 0) + 1;
      const key = names.filter((_, i) => payload[i] === channel).join('+');
      result.receivers[key] = (result.receivers[key] ?? 0) + 1;
    });
    if (any) result.read++;
  }

  await beat.release();
  sending = false;
  await sent;
  return result;
}
