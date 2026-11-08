// The observation layer: what the seeker's receivers make of the sender's
// ladder, as the sources sensory_map.jsonc names. Two ways in:
//
// - The listen notify, one per frame heard, carries the channel only: which
//   ladder and level arrived, not from where. The weakest level arriving is
//   the carrier, heard with the sender inside its lobe ahead or behind.
// - Each frame heard says which level got through, `frame.ch<k>`, and the
//   beats between heard frames are slots that went silent, `slot.ch<k>`
//   (see `slots`); the map weighs both per level.
// - The four corner receivers show the channel while a frame is in the air.
//   A volley of reads fired 46 to 60 ms before a frame's expected notify
//   lands in it three times in ten; the corners that heard name the side.
//   The frames of a ladder are not evenly spaced: within a round each comes
//   about 25 ms later after its command than the one before, the first of
//   the next round early again (utils/frame-timing.mjs, 2026-11-07). One
//   beat for all of them smeared the volleys over 50 to 75 ms and they
//   landed in 3 to 8 % of the frames. So each channel keeps its own expected
//   notify, recurring once a round; the sender holds the round's schedule
//   (utils/ladder.mjs).
//
// `tick` turns what came since the last tick into the sources and clears the
// events. Uses the Bolt's lower layers only: the infrared stream and the
// queue's fire.

import { DeviceId, SensorCommand, Target } from '@bolt/core';

const READ = { name: 'infraredReadings', device: DeviceId.sensor, id: SensorCommand.getInfraredReadings, target: Target.st, data: [] };
const CORNER_NAMES = ['FL', 'FR', 'BR', 'BL'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Observation {

  constructor (bolt, ir) {
    this.bolt = bolt;
    this.ir = ir;
    this.channels = new Map(Object.entries(ir.channels).map(([c, [range, strength]]) => [Number(c), { range, strength }]));
    this.heard = [];             // { t, channel } of the notifies, the last windows' worth
    this.events = this.fresh();
    this.expect = new Map();     // channel -> { t, heard }: its next notify expected at t + k rounds, last heard
    this.carrier = null;         // strength of the carrier
    this.near = false;
    this.stats = { misses: 0, frames: 0, reads: 0, landed: 0, named: 0, flooded: 0, bunched: 0 };
  }

  fresh () { return { miss: 0, carrier: 0, any: 0, closeness: 0, corners: new Set(), down: 0, up: 0, frames: {}, slots: {} }; }

  async start () {
    this.running = true;
    this.switchedAt = performance.now();   // the closeness has no mean yet: as after a switch of ladder
    this.release = await this.bolt.sensors.infrared.subscribe(({ payload }) => this.onNotify(payload[0] ?? 255));
    await this.bolt.sensors.listenInfrared(true);
    void this.volleys();
  }

  async stop () {
    this.running = false;
    await this.release?.();
  }

  onNotify (channel) {
    void this.bolt.sensors.listenInfrared(true).catch(() => {});   // a listen ends with the first message
    const level = this.channels.get(channel);
    if (!level) return;
    const t = performance.now();
    this.stats.frames++;
    this.slots(channel, level.range, t);
    if (this.heard.length && level.range !== this.range()) this.switchedAt = t;
    this.heard.push({ t, channel, ...level });
    this.events.any = 1;
    if (!this.heardAt || t - this.heardAt > 100) this.events.frames[channel] = (this.events.frames[channel] ?? 0) + 1;   // one frame, not its second notify
    this.heardAt = t;
    this.events.closeness += Math.log2(32 / level.strength);   // 16 says 1, 1 says 5: weaker frames arrive only near
    if (level.strength === this.carrier && level.range === this.range()) { this.events.carrier = 1; this.carrierAt = t; }
    else if (level.strength > this.carrier && this.carrier !== null) {   // a stronger level: was the carrier's frame of this round missed?
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
   * 100 ms, is no new frame. Every level's silence is evidence too: without
   * it every heard frame says "ahead", the front receivers hear better
   * (replay bench, 2026-11-08).
   */
  slots (channel, range, t) {
    const last = this.lastFrame;
    this.lastFrame = { t, channel, range };
    if (!last || last.range !== range || t - last.t < 100) return;
    const order = [...this.channels].filter(([, c]) => c.range === range).map(([ch]) => ch).sort((a, b) => a - b);
    const repeat = this.ir.repeat ?? 1, beats = Math.round((t - last.t) / this.ir.beatMs) - 1;
    if (beats < 1 || beats > order.length * repeat * 2) return;
    // the sending position after the last heard frame: its channel's last beat is assumed
    let pos = order.indexOf(last.channel) * repeat + repeat - 1;
    for (let i = 0; i < beats; i++) {
      pos = (pos + 1) % (order.length * repeat);
      const ch = order[Math.floor(pos / repeat)];
      this.events.slots[ch] = (this.events.slots[ch] ?? 0) + 1;
    }
  }

  /** The ladder the frames come on now: the last frame's. */
  range () { return this.heard.at(-1)?.range ?? 'long'; }

  /** Whether any channel's frames can be expected yet: before, the brain rolls on its own timer. */
  get timed () { return this.expect.size > 0; }

  roundMs (range) { return this.ir.beatMs * [...this.channels.values()].filter((c) => c.range === range).length; }

  /**
   * The channel's expected notify, a round on from the last, pulled 40 % of
   * the way to each notify that comes within 40 ms of it; a second notify of
   * the same frame (one in ten, 45 ms after the first) left out.
   */
  follow (channel, range, t) {
    const e = this.expect.get(channel), round = this.roundMs(range);
    if (e && t - e.heard < 100) return;
    const pred = e ? e.t + Math.round((t - e.t) / round) * round : t;
    this.expect.set(channel, { t: Math.abs(t - pred) < 40 ? pred + 0.4 * (t - pred) : t, heard: t, range });
  }

  /** When the next volley's first read goes: before the soonest expected notify of a channel heard in the last 3 s. */
  nextVolley (now) {
    const { leadMs } = this.ir.volley, range = this.range();
    let next = Infinity;
    for (const e of this.expect.values()) {
      if (e.range !== range || now - e.heard > 3000) continue;
      const round = this.roundMs(range);
      next = Math.min(next, e.t + Math.ceil((now + leadMs + 5 - e.t) / round) * round);
    }
    return next - leadMs;
  }


  /** Reads timed into every expected frame, past the queue, while running. */
  async volleys () {
    const { reads, stepMs } = this.ir.volley;
    while (this.running) {
      let at = this.nextVolley(performance.now());
      if (at === Infinity) { await wait(100); continue; }
      const replies = [];
      for (let k = 0; k < reads; k++, at += stepMs) {
        await wait(Math.max(0, at - performance.now() - 4));
        while (performance.now() < at) { /* the last ms spun */ }
        this.stats.reads++;
        replies.push(this.bolt.queue.fire(READ, 90).then((a) => a.payload, () => null));
      }
      const all = await Promise.all(replies);
      this.afterVolley?.();   // after the replies: a roll written behind the reads but before their replies cost them all (2026-11-06)
      const first = all.find((p) => p && p.some((c) => this.channels.has(c)));
      if (first) this.onRead(first);
    }
  }

  onRead (payload) {
    this.stats.landed++;
    const heard = CORNER_NAMES.filter((_, i) => this.channels.has(payload[i]));
    const opposite = heard.length === 2 && (heard.join() === 'FL,BR' || heard.join() === 'FR,BL');
    if (heard.length === 4) { this.stats.flooded++; return; }
    if (opposite) return;
    this.stats.named++;
    for (const c of heard) this.events.corners.add(c);
  }

  /** The carrier and the ladder's state from the frames of the last windows. */
  update (now) {
    const { carrier, near } = this.ir;
    const keep = Math.max(carrier.windowMs, near.windowMs, near.lostMs);
    while (this.heard.length && now - this.heard[0].t > keep) this.heard.shift();
    const range = this.range();
    const counts = new Map();
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

  /** The sources of this tick; `forward` (0..1) and `still` (0 or 1) are the motor's efference copies. */
  tick (forward, still) {
    this.update(performance.now());
    const e = this.events;
    this.events = this.fresh();
    const s = { 'frame.carrier': e.carrier, 'frame.miss': e.miss, 'frame.any': e.any, 'carrier.down': e.down, 'carrier.up': e.up,
      'ladder.near': this.near ? 1 : 0, 'self.forward': forward, 'self.still': still,
      'frame.closeness': e.closeness, 'ladder.settled': performance.now() - (this.switchedAt ?? -Infinity) > this.ir.settleMs ? 1 : 0 };
    for (const c of CORNER_NAMES) s[`corner.${c}`] = e.corners.has(c) ? 1 : 0;
    for (const ch of this.channels.keys()) { s[`frame.ch${ch}`] = e.frames[ch] ?? 0; s[`slot.ch${ch}`] = e.slots[ch] ?? 0; }
    return s;
  }

}
