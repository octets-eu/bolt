import type { Context } from '../context';
import type { Sensors } from '../sensors/sensors';
import { DeviceId, SensorCommand, Target } from '../protocol/constants';
import { wait } from '../helpers/utils';

/**
 * The sender's beat and timed reads of the receivers: how a Bolt learns
 * which of its four receivers hears another Bolt. Measured 2026-10-04 at
 * 80 cm, standing, facing; the record is the vault note "2026-10-04
 * Infrared timing".
 *
 * - A Bolt sends on its own clock, one frame per 200.44 ms. A send command
 *   loads what goes out at the next sending moment, so from command to
 *   frame 0 to 260 ms pass, spread evenly.
 * - A receiver shows the channel it hears only while a frame is in the air,
 *   7.5 ms. Reads at no particular moment caught one 4 times in 440.
 * - The listen notify arrives on the beat, scattered by 14 ms, so the beat
 *   is learned from the notifies, and a read issued 42 to 48 ms before the
 *   next expected notify lands in the frame: one read caught 20 % of the
 *   frames, three reads 6 ms apart 35 to 39 %, five 43 %.
 * - About one frame in ten gives a second notify some 45 ms after the
 *   first. Taken as a correction it pulls the beat late, so a notify more
 *   than `offBeatMs` off the beat is ignored.
 * - Commands reach the Bolt on a 15 ms grid, so about half the frames hold
 *   no moment at which a read can be carried out, whatever the timing.
 * - Reads that must land milliseconds apart cannot go through the serial
 *   queue. `Queue.fire` writes them at once, without response, and the Bolt
 *   answers each under its own sequence number, in order (150 of 150 pairs,
 *   volleys of three and five).
 */

/** The sender's beat, fitted to 417 notifies (2026-10-04). */
export const PERIOD_MS = 200.44;

const READ = { name: 'infraredReadings', device: DeviceId.sensor, id: SensorCommand.getInfraredReadings, target: Target.st, data: [] } as const;

export interface Beat {
  /** When the first notify at or after `t` is expected, on the `performance.now()` clock; null until the beat is learned. */
  next (t: number): number | null;
  /** Notifies the beat was learned from, then taken as corrections, and ignored as off it. */
  readonly counts: { learned: number; onBeat: number; offBeat: number };
  /** Let go of the infrared stream. */
  release (): Promise<void>;
}

export interface BeatOptions {
  /** Notifies that give the first phase. */
  learnFrom?: number | undefined;
  /** A notify further off the beat than this is no correction of it. */
  offBeatMs?: number | undefined;
}

/** Signed distance of `t` from the nearest beat instant `phase + k * PERIOD_MS`, ms. */
function offBeat (t: number, phase: number): number {
  const d = (((t - phase) % PERIOD_MS) + PERIOD_MS) % PERIOD_MS;
  return d > PERIOD_MS / 2 ? d - PERIOD_MS : d;
}

/** Circular mean of `times` on the beat, as a phase in 0..PERIOD_MS. */
function meanPhase (times: readonly number[]): number {
  let x = 0, y = 0;
  for (const t of times) {
    const a = 2 * Math.PI * (t % PERIOD_MS) / PERIOD_MS;
    x += Math.cos(a);
    y += Math.sin(a);
  }
  return ((Math.atan2(y, x) / (2 * Math.PI) * PERIOD_MS) % PERIOD_MS + PERIOD_MS) % PERIOD_MS;
}

/** Resolve at `t` on the `performance.now()` clock; a timer is good to a few ms only, the last ones are spun. */
async function until (t: number): Promise<void> {
  await wait(Math.max(0, t - performance.now() - 5));
  while (performance.now() < t) { /* spin */ }
}

/**
 * Follow the beat a sender's frames arrive on, from the listen notifies on
 * `channels`. Holds the infrared stream and re-arms the one-shot listen
 * after every notify; `onFrame` gets every notify's channel. The first
 * `learnFrom` notifies give the phase, those more than `offBeatMs` from
 * their mean left out; every later notify within `offBeatMs` of the beat
 * moves it by a fifth of its error. Returns at once; `next` answers null
 * until the beat is learned.
 */
export async function trackBeat (sensors: Sensors, channels: readonly number[], onFrame?: (channel: number) => void, { learnFrom = 10, offBeatMs = 25 }: BeatOptions = {}): Promise<Beat> {
  const learn: number[] = [];
  const counts = { learned: 0, onBeat: 0, offBeat: 0 };
  let phase: number | null = null;

  const release = await sensors.infrared.subscribe(({ payload }) => {
    const t = performance.now();
    const channel = payload[0] ?? 255;
    if (channels.includes(channel)) {
      onFrame?.(channel);
      if (phase === null) {
        learn.push(t);
        if (learn.length >= learnFrom) {
          const rough = meanPhase(learn);
          const kept = learn.filter(x => Math.abs(offBeat(x, rough)) <= offBeatMs);
          phase = meanPhase(kept.length >= learnFrom / 2 ? kept : learn);
          counts.learned = learn.length;
        }
      } else {
        const error = offBeat(t, phase);
        if (Math.abs(error) <= offBeatMs) {
          phase += 0.2 * error;
          counts.onBeat++;
        } else counts.offBeat++;
      }
    }
    void sensors.listenInfrared(true);
  });
  await sensors.listenInfrared(true);

  return {
    next: (t) => phase === null ? null : phase + Math.ceil((t - phase) / PERIOD_MS) * PERIOD_MS,
    counts,
    release,
  };
}

/**
 * `count` reads of the receivers, the first at `at` on the `performance.now()`
 * clock, `stepMs` apart, fired past the serial queue so they land together.
 * One payload per read: the channel each receiver hears, front left, front
 * right, back right, back left, 255 for none; null where the write failed
 * or no reply came within 90 ms.
 */
export async function readVolley (ctx: Context, at: number, count = 3, stepMs = 6): Promise<(readonly number[] | null)[]> {
  const replies: Promise<readonly number[] | null>[] = [];
  for (let k = 0; k < count; k++) {
    await until(at + k * stepMs);
    replies.push(ctx.queue.fire(READ, 90).then(ack => ack.payload, () => null));
  }
  return Promise.all(replies);
}
