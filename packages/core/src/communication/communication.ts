import type { Actuators } from '../actuators/actuators';
import type { Context } from '../context';
import { BLACK, SENDING } from './images';
import type { Color } from '../config';
import type { Image, ImageName } from './images';
import { range, wait, whenAborted } from '../helpers/utils';

/** What shows on the matrix, by who sets it. */
export type Slot = 'motor' | 'infrared' | 'mark';

export type LadderRange = 'long' | 'short';

/** A ladder: channel k carries strength k; the channels name the ladder, so a frame says which ladder and which level it is. */
export interface Ladder {
  readonly range:     LadderRange;
  readonly channels:  readonly number[];
  readonly strengths: readonly number[];
  /** One round and the notify's scatter: every level's frame falls into it. */
  readonly roundMs:   number;
}

/**
 * The infrared ladders a Bolt sends to be found, one frame per 200 ms (a
 * Bolt emits no faster), weakest level first. The level that is just
 * arriving at the seeker's distance is heard with the sender ahead or
 * behind and falls silent with it abeam, stronger ones arrive all round.
 * The long ladder covers the room, the short one the last stretch, where
 * the long one's weakest level is heard all round. Each sends on channels
 * of its own, so the seeker tells them apart by the frames. The strengths
 * are chosen; the emitters go to 255.
 */
export const LADDERS: { readonly [range in LadderRange]: Ladder } = {
  long:  { range: 'long',  channels: [0, 1, 2, 3], strengths: [2, 4, 8, 16], roundMs: 4 * 200 + 50 },
  short: { range: 'short', channels: [4, 5, 6],    strengths: [1, 2, 4],     roundMs: 3 * 200 + 50 },
};
/** The long ladder's strengths and round, for the experiments written against the one ladder. */
export const LADDER = LADDERS.long.strengths;
export const ROUND_MS = LADDERS.long.roundMs;

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
  private readonly slots: { [slot in Slot]: ImageName | readonly ImageName[] | null } = { motor: null, infrared: null, mark: null };
  private ladder: Ladder = LADDERS.long;

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
   * held; a sequence in either runs alone; mark is laid over all and does
   * not blink. A collision flash stays on top and drops back onto the result.
   */
  async state (slot: Slot, image: ImageName | readonly ImageName[] | null): Promise<void> {
    this.slots[slot] = image;
    const names = (v: ImageName | readonly ImageName[] | null): ImageName[] => v === null ? [] : typeof v === 'string' ? [v] : [...v];
    const motor = names(this.slots.motor), infrared = names(this.slots.infrared);
    const shown = infrared.length > 1 ? infrared : motor.length > 1 ? motor : [...motor, ...infrared];
    await this.actuators.matrix.animate(shown.length > 1 ? 'blink' : 'show', shown, names(this.slots.mark)[0] ?? null);
  }

  /** The ladder sent from the next round on, shown as the turning 'i', sparse for the short one. */
  async switchLadder (range: LadderRange): Promise<void> {
    this.ladder = LADDERS[range];
    await this.state('infrared', SENDING[range]);
  }

  /** Send the ladder, level after level, until fullstop; `switchLadder` changes it on the way. Returns the frames sent. */
  async sendLadder (range: LadderRange = 'long'): Promise<number> {
    const s = this.ctx.motion;
    let frames = 0;
    await this.switchLadder(range);
    try {
      while (!s.aborted) {
        const { channels, strengths } = this.ladder;
        for (const [k, channel] of channels.entries()) {
          if (s.aborted) break;
          const t = this.ctx.now();
          await this.actuators.infrared.send(channel, strengths[k] ?? 0);
          frames++;
          await wait(Math.max(0, 200 - (this.ctx.now() - t)));
        }
      }
    } finally {
      await this.state('infrared', null);
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
