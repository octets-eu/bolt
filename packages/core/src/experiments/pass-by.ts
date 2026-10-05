import type { Bolt } from '../bolt';
import { distance } from '../helpers/math';
import type { Point } from '../helpers/math';
import { wait } from '../helpers/utils';

/**
 * passBy: what a rolling Bolt hears of a sender it passes at a distance.
 * `sender` stands and sends `ladder`, channel k at strength ladder[k], one
 * frame per 200 ms; `roller` rolls the line `from` to `to` and back,
 * `passes` legs in all, at `cmPerSec`, and counts the frames sent and the
 * listen notifies per strength and per `binCm` of the line. `from` and `to`
 * are in the roller's locator frame; a frame and a notify are put where the
 * locator stands at that moment. Ends after the last leg or on a fullstop
 * of either Bolt.
 *
 * Two runs on 2026-10-05, SB-9129 sending and facing the line, SB-11DF
 * rolling a 3 m line that passes it at 72 cm, four legs, about 11 cm/s.
 * Heard of sent, by the sender's bearing from the roller's front:
 *
 * - Ladder 2, 4, 8, 16. Strength 4: 42 of 46 at 30 to 45 and 135 to 150
 *   degrees, 2 of 23 at 75 to 120 degrees, abeam. Strength 8: 40 of 46 and
 *   8 of 23. Strength 16: heard everywhere. Strength 2: 4 notifies in all.
 *   At 155 cm, ahead or behind, strength 4 came to 7 of 28.
 * - A ladder of three neighbouring strengths that the coordinator moved by
 *   what the roller heard, with a probe one step below the lowest in every
 *   second round. Strength 4: 47 of 67 ahead, 2 of 29 abeam, 30 of 42
 *   behind. Strength 8 abeam: 18 of 24. Strength 2: 8 of 38 ahead, 0 of 22
 *   abeam.
 *
 * So the weakest strength that arrives falls silent while the sender is
 * abeam. The moving ladder was dropped: it put 30 % of the frames on
 * strength 4 against 25 %, moved 19 times in 118 s, and on two of four legs
 * it moved up at abeam, taking "lowest gone, middle still there" for "too
 * far": the strength above the weakest does not reliably drop abeam.
 */

export interface PassByLeg {
  /** Rolled `from` to `to`, or back. */
  forward: boolean;
  /** Per bin of the line, counted from `from`: seconds the roller spent in it. */
  seconds: number[];
  /** Per bin and per strength of the ladder: frames sent, and notifies. */
  sent:  number[][];
  heard: number[][];
}

export interface PassByResult {
  reason: 'done' | 'stopped' | 'error';
  seconds: number;
  frames: number;
  ladder: readonly number[];
  binCm: number;
  legs: PassByLeg[];
}

export async function passBy (roller: Bolt, sender: Bolt, from: Point, to: Point, passes = 4, cmPerSec = 10, ladder: readonly number[] = [4, 8, 16], binCm = 10): Promise<PassByResult> {

  const s = roller.motion, stop = sender.motion;
  const t0 = roller.now();
  const length = distance(from, to), bins = Math.ceil(length / binCm);
  /** The bin the roller is in by its locator; beyond the line's ends, the end bins. */
  const bin = (): number => {
    const p = roller.status.position;
    const along = ((p.x - from.x) * (to.x - from.x) + (p.y - from.y) * (to.y - from.y)) / length;
    return Math.min(bins - 1, Math.max(0, Math.floor(along / binCm)));
  };
  const table = (): number[][] => Array.from({ length: bins }, () => ladder.map(() => 0));

  const legs: PassByLeg[] = [];
  let leg = null as PassByLeg | null;
  let last = roller.now();
  let frames = 0;

  const offInfrared = await roller.sensors.infrared.subscribe(({ payload }) => {
    const channel = payload[0];
    const row = leg?.heard[bin()];
    if (row && channel !== undefined && channel < ladder.length) row[channel] = (row[channel] ?? 0) + 1;
    // the listen ends with the first message
    void roller.sensors.listenInfrared(true);
  });
  const releaseMotion = await roller.sensors.motion.subscribe(() => {
    const t = roller.now(), k = bin();
    if (leg) leg.seconds[k] = (leg.seconds[k] ?? 0) + (t - last) / 1000;
    last = t;
  });

  roller.log('info', `passBy start ${JSON.stringify({ roller: roller.name, sender: sender.name, from, to, passes, cmPerSec, ladder, binCm })}`);

  let sending = true;
  const sent = (async (): Promise<boolean> => {
    while (sending && !stop.aborted) {
      for (const [channel, strength] of ladder.entries()) {
        if (!sending || stop.aborted) break;
        const t = roller.now();
        await sender.actuators.infrared.send(channel, strength);
        frames++;
        const row = leg?.sent[bin()];
        if (row) row[channel] = (row[channel] ?? 0) + 1;
        await wait(Math.max(0, 200 - (roller.now() - t)));
      }
    }
    return true;
  })().catch(() => false);

  let reason: PassByResult['reason'] = 'done';
  try {
    await roller.navigation.rollToPoint(from);
    await roller.sensors.listenInfrared(true);
    for (let k = 0; k < passes && !s.aborted && !stop.aborted; k++) {
      const forward = k % 2 === 0;
      leg = { forward, seconds: new Array<number>(bins).fill(0), sent: table(), heard: table() };
      legs.push(leg);
      await roller.navigation.rollToPoint(forward ? to : from, 5, cmPerSec);
      leg.seconds = leg.seconds.map(v => Math.round(v * 10) / 10);
      roller.log('info', `passBy leg ${k + 1} ${JSON.stringify(leg)}`);
      leg = null;
    }
  } catch {
    reason = 'error';
  }
  if (s.aborted || stop.aborted) reason = 'stopped';

  sending = false;
  if (!await sent) reason = 'error';
  await releaseMotion();
  await offInfrared();

  const result: PassByResult = {
    reason,
    seconds: Math.round((roller.now() - t0) / 100) / 10,
    frames,
    ladder,
    binCm,
    legs,
  };
  roller.log('info', `passBy end ${JSON.stringify({ reason: result.reason, seconds: result.seconds, frames, legs: legs.length })}`);
  return result;
}
