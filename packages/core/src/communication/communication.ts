import type { Actuators } from '../actuators/actuators';
import type { Context } from '../context';
import { BLACK } from './images';
import type { Color } from '../config';
import type { Image, ImageName } from './images';
import { range, wait, whenAborted } from '../helpers/utils';

/** What shows on the matrix, by who sets it. */
export type Slot = 'motor' | 'infrared' | 'mark';

/**
 * The infrared ladder a Bolt sends to be found: channel k carries strength
 * LADDER[k], weakest first, one frame per 200 ms (a Bolt emits no faster,
 * 2026-10-01), so each level comes round every 0.85 s and the channel of a
 * listen notify says which level got through. The level that is just
 * arriving at the seeker's distance is heard with the sender ahead or
 * behind and falls silent with it abeam, stronger ones arrive all round
 * (pass-by 2026-10-05, seek-edge runs and sweep trials 2026-10-10/11): 2 up
 * to about 80 cm, 4 at 0.6 to 1.0 m, 8 at 1.0 to 1.7 m, 16 beyond that to
 * 4 m. The strengths are chosen; the emitters go to 255.
 */
export const LADDER = [2, 4, 8, 16];
/** One ladder round and the notify's scatter: every level's frame falls into it. */
export const ROUND_MS = LADDER.length * 200 + 50;

export interface BroadcastOptions {
  /** Infrared codes to send in turn, default all eight. */
  codes?:    readonly number[] | undefined;
  rounds?:   number | undefined;
  /** Pause after each round. */
  pauseMs?:  number | undefined;
  strength?: number | undefined;
}

/**
 * What the Bolt shows and tells: matrix images and text, LEDs, infrared
 * broadcasts. Sequences of actuator packets; nothing here moves the ball.
 * A fullstop ends a running sequence, like a navigation step.
 */
export class Communication {

  private readonly ctx:       Context;
  private readonly actuators: Actuators;
  private readonly slots: { [slot in Slot]: ImageName | null } = { motor: null, infrared: null, mark: null };

  constructor (ctx: Context, actuators: Actuators) {
    this.ctx       = ctx;
    this.actuators = actuators;
  }

  /** Draw an 8x8 image pixel by pixel on a `background`. */
  async showImage (image: Image, color: Color = this.ctx.config.colors.matrix, background: Color = BLACK): Promise<void> {
    await this.actuators.matrix.color(background);
    for (const row of range(8)) {
      for (const col of range(8)) {
        if (image[row]?.[col]) await this.actuators.matrix.pixel(col, row, color);
      }
    }
  }

  /** Into the log, one line each. frames: the animation frames stored on the Bolt. */
  async log (what: 'frames'): Promise<void> {
    switch (what) {
      case 'frames': {
        const frames = await this.actuators.matrix.frames();
        if (!frames.length) this.ctx.log('info', 'matrix frames: none');
        for (const f of frames) this.ctx.log('info', `matrix frame ${f}`);
        break;
      }
    }
  }

  async char (char: string, color: Color = this.ctx.config.colors.matrix): Promise<void> {
    await this.actuators.matrix.char(char, color);
  }

  async blinkChar (char: string, times = 3): Promise<void> {
    const s = this.ctx.motion;
    const aborted = whenAborted(s);
    for (const _ of range(times)) {
      await this.actuators.matrix.char(' ', BLACK);
      await this.actuators.matrix.char(char, this.ctx.config.colors.matrix);
      await Promise.race([wait(200), aborted]);
      if (s.aborted) return;
    }
  }

  /** Scroll `text` once and resolve when the Bolt reports it done, or on fullstop. */
  async scrollText (text: string, color: Color = this.ctx.config.colors.matrix, speed = 10): Promise<void> {
    const aborted = whenAborted(this.ctx.motion);
    const done = this.ctx.events.once('scrolldone', { timeoutMs: 2000 + text.length * 1500 });
    await this.actuators.matrix.scrollText(text, color, speed, false);
    await Promise.race([done, aborted]);
  }

  /**
   * One slot of what the matrix shows; each caller sets only its own. motor
   * and infrared blink with each other when both are set, one alone is
   * held; mark is laid over both and does not blink. A collision flash
   * stays on top and drops back onto the result.
   */
  async state (slot: Slot, image: ImageName | null): Promise<void> {
    this.slots[slot] = image;
    const names = [this.slots.motor, this.slots.infrared].filter((n): n is ImageName => n !== null);
    await this.actuators.matrix.animate(names.length === 2 ? 'blink' : 'show', names, this.slots.mark);
  }

  /** Send the ladder, level after level, until fullstop. Returns the frames sent. */
  async sendLadder (): Promise<number> {
    const s = this.ctx.motion;
    let frames = 0;
    while (!s.aborted) {
      for (const [channel, strength] of LADDER.entries()) {
        if (s.aborted) break;
        const t = this.ctx.now();
        await this.actuators.infrared.send(channel, strength);
        frames++;
        await wait(Math.max(0, 200 - (this.ctx.now() - t)));
      }
    }
    return frames;
  }

  /** Emit infrared codes in turn so another Bolt listening on any channel hears this one. */
  async broadcastInfrared (options: BroadcastOptions = {}): Promise<void> {
    const { codes = range(8), rounds = 1, pauseMs = 1000, strength = 255 } = options;
    const s = this.ctx.motion;
    const aborted = whenAborted(s);
    for (const _ of range(rounds)) {
      for (const code of codes) await this.actuators.infrared.send(code, strength);
      if (pauseMs > 0) await Promise.race([wait(pauseMs), aborted]);
      if (s.aborted) return;
    }
  }

}
