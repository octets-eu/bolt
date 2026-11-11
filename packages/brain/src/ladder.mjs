// The sender's ladder, sent by the brain's program through the Bolt's infrared
// actuator: the levels of communication.ts's LADDERS, weakest first, each held
// for `repeat` beats, one command every 200 ms on an absolute schedule.
//
// Why not Communication.sendLadder: a Bolt that is sent a new code every beat
// loses its frame clock. Frames then come 210 to 320 ms apart instead of 195
// to 205, the seeker's notifies scatter +-40 ms about the beat instead of
// +-15, and the corner reads timed into the frames land in 3 to 8 % of the
// beats instead of 30 to 36 % (utils/frame-timing.mjs, link-load.mjs, 2026-11-07).
// A code held for two beats keeps the clock.

import { LADDERS } from '@bolt/core';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class LadderSender {

  constructor (bolt, range = 'long', repeat = 2) { this.bolt = bolt; this.range = range; this.repeat = repeat; this.frames = 0; }

  /** From the next round on. */
  switch (range) { this.range = range; void this.bolt.communication.switchLadder(range).catch(() => {}); }

  /** Sends until `stop`; resolves then. */
  async run () {
    this.running = true;
    await this.bolt.communication.switchLadder(this.range);   // shows the ladder on the matrix
    let at = performance.now();
    while (this.running) {
      const { channels, strengths } = LADDERS[this.range];
      for (let k = 0; k < channels.length * this.repeat && this.running; k++) {
        const level = Math.floor(k / this.repeat);
        await this.bolt.actuators.infrared.send(channels[level], strengths[level]).catch(() => {});
        this.frames++;
        at += 200;
        await wait(Math.max(0, at - performance.now()));
        if (performance.now() - at > 200) at = performance.now();   // fell behind: start the schedule again
      }
    }
  }

  stop () { this.running = false; }

}
