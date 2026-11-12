// The observation layer: what the seeker's receivers make of the sender's
// ladder, as the input ports of circuit.json's input neurons. Its constants
// are circuit.json's `observation`. Two ways in:
//
// - The listen notify, one per frame heard, carries the channel only: which
//   ladder and level arrived, not from where. The weakest level arriving is
//   the carrier, heard with the sender inside its lobe ahead or behind.
// - Each frame heard says which level got through, `frame.ch<k>`, and the
//   beats between heard frames are slots that went silent, `slot.ch<k>`
//   (see `slots`); the circuit weighs both per level.
// - The four corner receivers show the channel while a frame is in the air.
//   A volley of reads fired 46 to 60 ms before a frame's expected notify
//   lands in it three times in ten; the corners that heard name the side.
//   The frames of a ladder are not evenly spaced: within a round each comes
//   about 25 ms later after its command than the one before, the first of
//   the next round early again (utils/frame-timing.mjs, 2026-11-07). One
//   beat for all of them smeared the volleys over 50 to 75 ms and they
//   landed in 3 to 8 % of the frames. So each channel keeps its own expected
//   notify, recurring once a round; the sender holds the round's schedule
//   (ladder.ts).
// - The motion stream, handed to `tick` as the sample the brain steps on:
//   the Bolt's own turn since the last tick, `self.turned`, and its step
//   over the floor in its own frame, `self.fwd` and `self.right`, from the
//   yaw and the locator; `self.still`, under 20 deg turned in the last
//   second; `self.forward`, the motor's efference copy the caller gives.
//
// `tick` turns what came since the last tick into the sources and clears the
// events. Uses the Bolt's lower layers only: the infrared stream and the
// queue's fire, for the reads and for the listen's re-arm, so neither waits
// behind a queued command. The clock is performance.now() unless the caller
// gives its own, as the bench does. The construction and `start` each count
// as a switch of ladder: the closeness has no mean yet.

import { DeviceId, SensorCommand, Target } from '@bolt/core';
import type { Bolt, LadderRange, Release } from '@bolt/core';
import type { Corner, Motion, ObservationConfig, Sources } from './types';

const READ = { name: 'infraredReadings' as const, device: DeviceId.sensor, id: SensorCommand.getInfraredReadings, target: Target.st, data: [] };
// the listen's re-arm, fired past the queue like the reads: behind a command that lost its ack (a matrix picture,
// 2026-11-09, run 10) the queued re-arm waited 3 s and the ear was off for the last 2.3 s of the approach.
// A fired write can fail on a busy link, and one that does leaves the ear off for good (the near path of
// 2026-11-09, pass 1: 11 frames in 3 s, then none in 200 s): `tick` re-arms through the queue, the watchdog,
// after `watchdogMs` without a notify
const LISTEN = { name: 'listenInfrared' as const, device: DeviceId.sensor, id: SensorCommand.listenInfraredMessages, target: Target.st, data: [255, 255, 255, 255, 255] };
const CORNER_NAMES: readonly Corner[] = ['FL', 'FR', 'BR', 'BL'];
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type Level = { range: LadderRange; strength: number };
type Heard = Level & { t: number; channel: number };

/** What came since the last tick. */
interface Events { miss: number; carrier: number; any: number; closeness: number; corners: Set<string>; down: number; up: number; frames: Record<number, number>; slots: Record<number, number> }

export interface ObservationStats { misses: number; frames: number; reads: number; landed: number; named: number; flooded: number; bunched: number; rearmed?: number }

export class Observation {

  readonly bolt: Pick<Bolt, 'sensors' | 'queue'>;
  readonly ir: ObservationConfig;
  readonly clock: { now (): number };
  readonly channels: Map<number, Level>;
  readonly heard: Heard[] = [];                 // the notifies, the last windows' worth
  events: Events;
  readonly expect = new Map<number, { t: number; heard: number; range: LadderRange }>();   // channel -> its next notify expected at t + k rounds, last heard
  carrier: number | null = null;                // strength of the carrier
  near = false;
  motion: Motion | null = null;                 // the last tick's motion sample
  readonly turns: { t: number; turned: number }[] = [];   // the last second's turns, for self.still
  readonly stats: ObservationStats = { misses: 0, frames: 0, reads: 0, landed: 0, named: 0, flooded: 0, bunched: 0 };
  running = false;
  private switchedAt: number;                   // the last change of ladder
  afterVolley: (() => void) | undefined;        // the runner's hook: a roll goes after the replies, not between the reads
  private release: Release | undefined;
  private armedAt: number | undefined;
  private heardAt: number | undefined;
  private carrierAt: number | undefined;
  private missAt: number | undefined;
  private lastFrame: { t: number; channel: number; range: LadderRange } | undefined;
  private carrierRange: LadderRange | undefined;
  private nearSince: number | undefined;

  constructor (bolt: Pick<Bolt, 'sensors' | 'queue'>, ir: ObservationConfig, clock: { now (): number } = performance) {
    this.bolt = bolt;
    this.ir = ir;
    this.clock = clock;
    this.switchedAt = clock.now();
    this.channels = new Map(Object.entries(ir.channels).map(([c, [range, strength]]): [number, Level] => [Number(c), { range, strength }]));
    this.events = this.fresh();
  }

  fresh (): Events { return { miss: 0, carrier: 0, any: 0, closeness: 0, corners: new Set(), down: 0, up: 0, frames: {}, slots: {} }; }

  async start (): Promise<void> {
    this.running = true;
    this.switchedAt = this.clock.now();   // the closeness has no mean yet: as after a switch of ladder
    this.release = await this.bolt.sensors.infrared.subscribe(({ payload }) => this.onNotify(payload[0] ?? 255));
    this.armedAt = this.clock.now();
    await this.bolt.sensors.listenInfrared(true);
    void this.volleys();
  }

  async stop (): Promise<void> {
    this.running = false;
    await this.release?.();
  }

  onNotify (channel: number): void {
    this.armedAt = this.clock.now();
    void this.bolt.queue.fire(LISTEN, this.ir.fireMs).catch(() => { this.armedAt = 0; });   // a listen ends with the first message; past the queue, the ear never waits behind the hand; failed, the watchdog re-arms
    const level = this.channels.get(channel);
    if (!level) return;
    const t = this.clock.now();
    this.stats.frames++;
    this.slots(channel, level.range, t);
    if (this.heard.length && level.range !== this.range()) this.switchedAt = t;
    this.heard.push({ t, channel, ...level });
    this.events.any = 1;
    if (!this.heardAt || t - this.heardAt > this.ir.secondNotifyMs) this.events.frames[channel] = (this.events.frames[channel] ?? 0) + 1;   // one frame, not its second notify
    this.heardAt = t;
    this.events.closeness += Math.log2(32 / level.strength);   // 16 says 1, 1 says 5: weaker frames arrive only near
    if (level.strength === this.carrier && level.range === this.range()) { this.events.carrier = 1; this.carrierAt = t; }
    else if (this.carrier !== null && level.strength > this.carrier) {   // a stronger level: was the carrier's frame of this round missed?
      const roundMs = 200 * [...this.channels.values()].filter((c) => c.range === level.range).length;
      if (t - (this.carrierAt ?? t) > 1.2 * roundMs && t - (this.missAt ?? -Infinity) > roundMs) { this.events.miss = 1; this.missAt = t; this.stats.misses++; }
    }
    this.follow(channel, level.range, t);
  }

  /**
   * The frames that did not arrive: the sender sends one frame per beat, the
   * ladder's channels in order, each held `ir.repeat` beats, so the beats
   * between the last heard frame and this one are known slots that went
   * unheard, each on a known channel. A second notify of one frame, within
   * `secondNotifyMs`, is no new frame. Every level's silence is evidence too: without
   * it every heard frame says "ahead", the front receivers hear better
   * (replay bench, 2026-11-08).
   */
  slots (channel: number, range: LadderRange, t: number): void {
    const last = this.lastFrame;
    this.lastFrame = { t, channel, range };
    if (!last || last.range !== range || t - last.t < this.ir.secondNotifyMs) return;
    const order = [...this.channels].filter(([, c]) => c.range === range).map(([ch]) => ch).sort((a, b) => a - b);
    const repeat = this.ir.repeat, beats = Math.round((t - last.t) / this.ir.beatMs) - 1;
    if (beats < 1 || beats > order.length * repeat * 2) return;
    // the sending position after the last heard frame: its channel's last beat is assumed
    let pos = order.indexOf(last.channel) * repeat + repeat - 1;
    for (let i = 0; i < beats; i++) {
      pos = (pos + 1) % (order.length * repeat);
      const ch = order[Math.floor(pos / repeat)]!;
      this.events.slots[ch] = (this.events.slots[ch] ?? 0) + 1;
    }
  }

  /** The ladder the frames come on now: the last frame's. */
  range (): LadderRange { return this.heard.at(-1)?.range ?? 'long'; }

  /** Whether any channel's frames can be expected yet: before, the brain rolls on its own timer. */
  get timed (): boolean { return this.expect.size > 0; }

  roundMs (range: LadderRange): number { return this.ir.beatMs * [...this.channels.values()].filter((c) => c.range === range).length; }

  /**
   * The channel's expected notify, a round on from the last, pulled `follow.pull`
   * of the way to each notify that comes within `follow.withinMs` of it; a second
   * notify of the same frame (one in ten, 45 ms after the first) left out.
   */
  follow (channel: number, range: LadderRange, t: number): void {
    const e = this.expect.get(channel), round = this.roundMs(range);
    const { withinMs, pull } = this.ir.follow;
    if (e && t - e.heard < this.ir.secondNotifyMs) return;
    const pred = e ? e.t + Math.round((t - e.t) / round) * round : t;
    this.expect.set(channel, { t: Math.abs(t - pred) < withinMs ? pred + pull * (t - pred) : t, heard: t, range });
  }

  /** When the next volley's first read goes: before the soonest expected notify of a channel heard within `expectMs`. */
  nextVolley (now: number): number {
    const { leadMs } = this.ir.volley, range = this.range();
    let next = Infinity;
    for (const e of this.expect.values()) {
      if (e.range !== range || now - e.heard > this.ir.expectMs) continue;
      const round = this.roundMs(range);
      next = Math.min(next, e.t + Math.ceil((now + leadMs + 5 - e.t) / round) * round);
    }
    return next - leadMs;
  }

  /** Reads timed into every expected frame, past the queue, while running. */
  async volleys (): Promise<void> {
    const { reads, stepMs } = this.ir.volley;
    while (this.running) {
      let at = this.nextVolley(this.clock.now());
      if (at === Infinity) { await wait(100); continue; }
      const replies: Promise<readonly number[] | null>[] = [];
      for (let k = 0; k < reads; k++, at += stepMs) {
        await wait(Math.max(0, at - this.clock.now() - 4));
        while (this.clock.now() < at) { /* the last ms spun */ }
        this.stats.reads++;
        replies.push(this.bolt.queue.fire(READ, 90).then((a) => a.payload, () => null));
      }
      const all = await Promise.all(replies);
      this.afterVolley?.();   // after the replies: a roll written behind the reads but before their replies cost them all (2026-11-06)
      const first = all.find((p) => p && p.some((c) => this.channels.has(c)));
      if (first) this.onRead(first);
    }
  }

  onRead (payload: readonly number[]): void {
    this.stats.landed++;
    const heard = CORNER_NAMES.filter((_, i) => this.channels.has(payload[i] ?? 255));
    const opposite = heard.length === 2 && (heard.join() === 'FL,BR' || heard.join() === 'FR,BL');
    if (heard.length === 4) { this.stats.flooded++; return; }
    if (opposite) return;
    this.stats.named++;
    for (const c of heard) this.events.corners.add(c);
  }

  /** The carrier and the ladder's state from the frames of the last windows. */
  update (now: number): void {
    const { carrier, near } = this.ir;
    const keep = Math.max(carrier.windowMs, near.windowMs, near.lostMs);
    while (this.heard.length && now - this.heard[0]!.t > keep) this.heard.shift();
    const range = this.range();
    const counts = new Map<number, number>();
    for (const h of this.heard) if (h.range === range && now - h.t <= carrier.windowMs) counts.set(h.strength, (counts.get(h.strength) ?? 0) + 1);
    const strengths = [...counts].filter(([, n]) => n >= carrier.minFrames).map(([s]) => s).sort((a, b) => a - b);
    const next = strengths[0] ?? null;
    if (this.carrier !== null && next !== null && range === this.carrierRange) {
      if (next < this.carrier) this.events.down = 1;
      if (next > this.carrier) this.events.up = 1;
    }
    this.carrier = next;
    this.carrierRange = range;

    if (!this.near) {
      const weakest = this.heard.filter((h) => h.range === 'long' && h.strength === 2 && now - h.t <= near.windowMs).length;
      this.near = weakest >= near.minFrames;
    } else if (!this.heard.some((h) => h.range === 'short' && now - h.t <= near.lostMs) && this.nearSince !== undefined && now - this.nearSince > near.lostMs) {
      this.near = false;
    }
    if (this.near && this.nearSince === undefined) this.nearSince = now;
    if (!this.near) this.nearSince = undefined;
  }

  /**
   * The sources of this tick. `motion` is the sample the brain steps on,
   * `{ heading, x, y }`: the heading clockwise from the locator's +y, the
   * reset's nose, the locator in cm; the turn and the step are taken from the
   * last tick's sample, the step in the Bolt's frame of that sample, forward
   * along its heading and right across it. `forward` (0..1) is the motor's
   * efference copy.
   */
  tick (motion: Motion, forward = 0): Sources {
    const now = this.clock.now();
    this.update(now);
    if (this.running && now - (this.heardAt ?? this.armedAt ?? now) > this.ir.watchdogMs && now - (this.armedAt ?? 0) > this.ir.watchdogMs) {   // the watchdog
      this.armedAt = now;
      this.stats.rearmed = (this.stats.rearmed ?? 0) + 1;
      void this.bolt.sensors.listenInfrared(true).catch(() => {});
    }
    const e = this.events;
    this.events = this.fresh();
    const last = this.motion ?? motion;
    const turned = ((motion.heading - last.heading + 540) % 360) - 180;
    const h = last.heading * Math.PI / 180, dx = motion.x - last.x, dy = motion.y - last.y;
    this.motion = motion;
    this.turns.push({ t: now, turned });
    while (now - this.turns[0]!.t > 1000) this.turns.shift();
    const still = this.turns.reduce((a, x) => a + Math.abs(x.turned), 0) < 20 ? 1 : 0;
    const s: Sources = { 'frame.carrier': e.carrier, 'frame.miss': e.miss, 'frame.any': e.any, 'carrier.down': e.down, 'carrier.up': e.up,
      'ladder.near': this.near ? 1 : 0, 'self.forward': forward, 'self.still': still,
      'self.turned': turned, 'self.fwd': dx * Math.sin(h) + dy * Math.cos(h), 'self.right': dx * Math.cos(h) - dy * Math.sin(h),
      'frame.closeness': e.closeness, 'ladder.settled': now - this.switchedAt > this.ir.settleMs ? 1 : 0 };
    for (const c of CORNER_NAMES) s[`corner.${c}`] = e.corners.has(c) ? 1 : 0;
    for (const ch of this.channels.keys()) { s[`frame.ch${ch}`] = e.frames[ch] ?? 0; s[`slot.ch${ch}`] = e.slots[ch] ?? 0; }
    return s;
  }

}
