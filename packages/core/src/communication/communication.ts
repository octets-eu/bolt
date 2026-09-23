import type { Actuators } from '../actuators/actuators';
import type { Context } from '../context';
import { BLACK } from './images';
import type { Color } from '../config';
import type { Image } from './images';
import { anySignal, range, wait } from '../helpers/utils';

export interface BroadcastOptions {
  /** Infrared codes to send in turn, default all eight. */
  codes?:    readonly number[] | undefined;
  rounds?:   number | undefined;
  /** Pause after each round. */
  pauseMs?:  number | undefined;
  strength?: number | undefined;
  signal?:   AbortSignal | undefined;
}

/**
 * What the Bolt shows and tells: matrix images and text, LEDs, infrared
 * broadcasts. Sequences of actuator packets; nothing here moves the ball.
 */
export class Communication {

  private readonly ctx:       Context;
  private readonly actuators: Actuators;

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

  async char (char: string, color: Color = this.ctx.config.colors.matrix): Promise<void> {
    await this.actuators.matrix.char(char, color);
  }

  async blinkChar (char: string, times = 3, signal?: AbortSignal): Promise<void> {
    const s = anySignal(this.ctx.motion, signal);
    for (const _ of range(times)) {
      await this.actuators.matrix.char(' ', BLACK);
      await this.actuators.matrix.char(char, this.ctx.config.colors.matrix);
      await wait(200, s);
    }
  }

  /** Scroll `text` once and resolve when the Bolt reports it done. */
  async scrollText (text: string, color: Color = this.ctx.config.colors.matrix, speed = 10, signal?: AbortSignal): Promise<void> {
    const done = this.ctx.events.once('scrolldone', { timeoutMs: 2000 + text.length * 1500, signal: anySignal(this.ctx.motion, signal) });
    await this.actuators.matrix.scrollText(text, color, speed, false);
    await done;
  }

  /** The Bolt's colour as a ring with a dark centre: what a Bolt shows when idle. */
  async restingPattern (): Promise<void> {
    const { matrix, black } = this.ctx.config.colors;
    await this.actuators.matrix.color(black);
    await this.actuators.matrix.fill(1, 1, 6, 6, matrix);
    await this.actuators.matrix.fill(3, 3, 4, 4, black);
  }

  /** Emit infrared codes in turn so another Bolt listening on any channel hears this one. */
  async broadcastInfrared (options: BroadcastOptions = {}): Promise<void> {
    const { codes = range(8), rounds = 1, pauseMs = 1000, strength = 255, signal } = options;
    const s = anySignal(this.ctx.motion, signal);
    for (const _ of range(rounds)) {
      for (const code of codes) await this.actuators.infrared.send(code, strength);
      if (pauseMs > 0) await wait(pauseMs, s);
    }
  }

}
