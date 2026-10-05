import type { Bolt } from '../bolt';
import type { PacketSummary } from '../events/events';
import { DeviceId, SensorCommand, Target } from '../protocol/constants';
import { encode } from '../protocol/packet';
import { wait } from '../helpers/utils';

/**
 * Infrared timing between two Bolts: how a reader gets the channel its
 * receivers hear (0x22) often enough to tell a direction from it. Measured
 * 2026-10-04, SB-11DF sending channel 2 at strength 4, SB-9129 reading,
 * 80 cm apart, facing; the record is "2026-10-04 Infrared timing" in the
 * vault's notes.
 *
 * - A receiver shows a channel only while a frame is in the air, 7.5 ms.
 *   Reads at no particular time caught one 4 times in 440 (0.9 %).
 * - A Bolt does not send when commanded. It sends on its own beat of
 *   200.44 ms, and a send command loads the next beat: from command to
 *   notify 0 to 260 ms passed, spread evenly. No delay between "send" and
 *   "read" is therefore the right one (eleven delays, -40 to +60 ms).
 * - The listen notify (0x2c) arrives on that beat, scattered by 14 ms. So
 *   the beat is learned from the notifies, and a read issued 42 to 48 ms
 *   before the next expected notify lands in the frame.
 * - About one frame in ten gives a second notify some 45 ms after the
 *   first (44 of 453). Taken as a correction it pulls the beat late: the
 *   tracker ignores notifies more than 25 ms off the beat.
 * - The Bolt answers a read that arrives before the last one is answered,
 *   in the order sent, each under its own sequence number (150 of 150
 *   pairs; volleys of three and five). The serial Queue cannot send such
 *   reads, so they go to the transport directly, without write response:
 *   with it the browser allows one write at a time. Six ms apart, 6 of 540
 *   writes still failed with "GATT operation already in progress".
 * - Frames read: one timed read 20 % (40 of 200), two reads 8 ms apart
 *   27 % (41 of 150), three reads 6 ms apart 35 to 39 %, five 43 %.
 * - Commands reach the Bolt on a 15.00 ms grid (948 arrival times), and a
 *   frame lasts 7.5 ms: about half the frames hold no instant at which a
 *   read can be carried out, whatever the timing.
 *
 * The functions are the page scripts of that day, typed. They have not run
 * in this form yet.
 */

/** The sender's beat, fitted to 417 notifies (2026-10-04). */
const PERIOD_MS = 200.44;

const READ = { name: 'infraredReadings', device: DeviceId.sensor, id: SensorCommand.getInfraredReadings, target: Target.st, data: [] } as const;

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

/** Resolve at `t` on the `performance.now()` clock. */
async function until (t: number): Promise<void> {
  await wait(Math.max(0, t - performance.now() - 5));
  while (performance.now() < t) { /* spin: a timer is good to a few ms only */ }
}

export interface Beat {
  /** When the first notify at or after `t` is expected, on the `performance.now()` clock. */
  next (t: number): number;
  /** Notifies taken for the beat, and notifies ignored as too far off it. */
  readonly counts: { onBeat: number; offBeat: number };
  release (): Promise<void>;
}

/**
 * Learn the beat a Bolt sends on from the listen notifies `reader` gets on
 * any of `channels` (a ladder sends its levels on one beat), and follow it: 20 notifies give the phase (those more than
 * `offBeatMs` from their own mean are left out), every later notify within
 * `offBeatMs` of the beat moves it by a fifth of its error. Null when 20
 * notifies do not come within 10 s. Holds the infrared stream and re-arms
 * the one-shot listen after every notify.
 */
export async function trackBeat (reader: Bolt, channels: readonly number[], offBeatMs = 25): Promise<Beat | null> {
  const learn: number[] = [];
  const counts = { onBeat: 0, offBeat: 0 };
  let phase: number | null = null;

  const release = await reader.sensors.infrared.subscribe(({ payload }) => {
    const t = performance.now();
    if (channels.includes(payload[0] ?? 255)) {
      if (phase === null) learn.push(t);
      else {
        const error = offBeat(t, phase);
        if (Math.abs(error) <= offBeatMs) {
          phase += 0.2 * error;
          counts.onBeat++;
        } else counts.offBeat++;
      }
    }
    void reader.sensors.listenInfrared(true);
  });
  await reader.sensors.listenInfrared(true);

  const t0 = performance.now();
  while (learn.length < 20 && performance.now() - t0 < 10000) await wait(50);
  if (learn.length < 20) {
    await release();
    return null;
  }
  const rough = meanPhase(learn);
  const kept = learn.filter(t => Math.abs(offBeat(t, rough)) <= offBeatMs);
  phase = meanPhase(kept.length >= 8 ? kept : learn);

  return {
    next: (t) => {
      const p = phase ?? 0;
      return p + Math.ceil((t - p) / PERIOD_MS) * PERIOD_MS;
    },
    counts,
    release,
  };
}

export interface VolleyReader {
  /**
   * `count` reads of the receivers, the first at `at` on the
   * `performance.now()` clock, `stepMs` apart. One payload per read (front
   * left, front right, back right, back left; 255 for none), null where no
   * reply came within 90 ms or the write failed.
   */
  read (at: number, count?: number, stepMs?: number): Promise<(readonly number[] | null)[]>;
  release (): void;
}

/**
 * Reads of the receivers (0x22) that do not wait for each other: written
 * to the transport without response, past the serial Queue. Their sequence
 * numbers run 100 ahead of the Queue's latest, taken from its action log,
 * so a reply cannot be mistaken for the ack of a queued command. The
 * receiver logs each reply as "ack for unknown sequence".
 */
export async function volleyReader (reader: Bolt): Promise<VolleyReader> {
  let latest = 0;
  let wanted: number[] = [];
  const replies = new Map<number, readonly number[]>();

  const release = reader.events.on('log', (entry) => {
    if (entry.type === 'action') latest = (entry.data as PacketSummary).id;
    else if (entry.type === 'event' && entry.subtype === 'ack') {
      const { msg } = entry.data as { msg: PacketSummary };
      if (msg.command === SensorCommand.getInfraredReadings && wanted.includes(msg.id) && !replies.has(msg.id)) replies.set(msg.id, msg.payload);
    }
  });
  // one command through the Queue, so its latest sequence number is known
  await reader.sensors.infraredReadings();

  return {
    read: async (at, count = 3, stepMs = 6) => {
      wanted = Array.from({ length: count }, (_, k) => (latest + 100 + k) % 255);
      replies.clear();
      const writes: Promise<void>[] = [];
      for (const [k, seq] of wanted.entries()) {
        await until(at + k * stepMs);
        writes.push(reader.transport.write(encode(seq, READ), false).catch(() => undefined));
      }
      await Promise.all(writes);
      const written = performance.now();
      while (performance.now() - written < 90 && wanted.some(seq => !replies.has(seq))) await wait(4);
      return wanted.map(seq => replies.get(seq) ?? null);
    },
    release,
  };
}

export interface TimedReadsResult {
  volleys: number;
  /** Volleys in which at least one read showed the channel. */
  read: number;
  /** Per position in the volley, how often that read showed the channel. */
  perRead: number[];
  /** Which receivers showed the channel, e.g. "FL+FR", and how often. */
  receivers: Record<string, number>;
  beat: { onBeat: number; offBeat: number };
}

/**
 * The run that gave the shares above: `sender` sends `channel` at
 * `strength` every 200 ms, `reader` learns the beat and on every beat reads
 * `count` times, `stepMs` apart, centred `msBefore` ms before the expected
 * notify. Ends after `volleys` beats or on the reader's fullstop. Null when
 * the beat could not be learned.
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

  const beat = await trackBeat(reader, [channel]);
  if (beat === null) {
    sending = false;
    await sent;
    return null;
  }
  const volley = await volleyReader(reader);

  const result: TimedReadsResult = { volleys: 0, read: 0, perRead: new Array<number>(count).fill(0), receivers: {}, beat: beat.counts };
  const lead = msBefore + stepMs * (count - 1) / 2;
  while (result.volleys < volleys && !s.aborted) {
    const payloads = await volley.read(beat.next(performance.now() + lead + 12) - lead, count, stepMs);
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

  volley.release();
  await beat.release();
  sending = false;
  await sent;
  return result;
}
