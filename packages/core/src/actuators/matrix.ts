import type { Context } from '../context';
import { DeviceId, IOCommand, Target } from '../protocol/constants';
import type { AckPayload } from '../protocol/payloads';
import type { Ack } from '../protocol/queue';
import type { FrameRotation } from '../protocol/constants';
import type { Color } from '../config';
import { clamp } from '../helpers/utils';

/**
 * The 8 by 8 LED matrix. Writes the commanded rotation into the status.
 *
 * The matrix has at most one owner. While held, writes from anyone else are
 * dropped, logged once per hold. Core knows a lock, not who wants it: the
 * camera tracker holds it while it runs, nothing else does today. This is
 * the one piece of arbitration in the actuators, see README.md.
 */
export class Matrix {

  private readonly ctx: Context;
  private droppedLogged = false;

  constructor (ctx: Context) {
    this.ctx = ctx;
  }

  private send<N extends string> (name: N, device: DeviceId, id: number, data: readonly number[], target: Target): Promise<Ack<AckPayload<N>>> {
    return this.ctx.queue.send({ name, device, id, target, data });
  }

  hold (owner: string): void {
    if (this.ctx.status.matrix.owner === owner) return;
    this.ctx.status.matrix.owner = owner;
    this.droppedLogged = false;
    this.ctx.log('info', `matrix held by ${owner}`);
    this.ctx.changed();
  }

  release (owner: string): void {
    if (this.ctx.status.matrix.owner !== owner) return;
    this.ctx.status.matrix.owner = null;
    this.ctx.log('info', `matrix released by ${owner}`);
    this.ctx.changed();
  }

  /** True when `owner` may write the matrix now. */
  private free (name: string, owner?: string): boolean {
    const holder = this.ctx.status.matrix.owner;
    if (!holder || holder === owner) return true;
    if (!this.droppedLogged) {
      this.droppedLogged = true;
      this.ctx.log('info', `${name} dropped, matrix held by ${holder}`);
    }
    return false;
  }

  /** Whole matrix one colour. Replaces any image. */
  async color (color: Color, owner?: string): Promise<void> {
    if (!this.free('matrixColor', owner)) return;
    await this.send('matrixColor', DeviceId.userIO, IOCommand.setMatrixColor, [...color], Target.st);
  }

  async pixel (x: number, y: number, color: Color, owner?: string): Promise<void> {
    if (!this.free('matrixPixel', owner)) return;
    await this.send('matrixPixel', DeviceId.userIO, IOCommand.setMatrixPixel, [x, y, ...color], Target.st);
  }

  async char (char: string, color: Color, owner?: string): Promise<void> {
    if (!this.free('matrixChar', owner)) return;
    await this.send('matrixChar', DeviceId.userIO, IOCommand.setMatrixChar, [...color, char.charCodeAt(0)], Target.st);
  }

  async fill (x0: number, y0: number, x1: number, y1: number, color: Color, owner?: string): Promise<void> {
    if (!this.free('matrixFill', owner)) return;
    await this.send('matrixFill', DeviceId.userIO, IOCommand.fillMatrix, [x0, y0, x1, y1, ...color], Target.st);
  }

  async line (x0: number, y0: number, x1: number, y1: number, color: Color, owner?: string): Promise<void> {
    if (!this.free('matrixLine', owner)) return;
    await this.send('matrixLine', DeviceId.userIO, IOCommand.drawMatrixLine, [x0, y0, x1, y1, ...color], Target.st);
  }

  /** Clears the matrix and stops a running animation. */
  async clear (owner?: string): Promise<void> {
    if (!this.free('matrixClear', owner)) return;
    await this.send('matrixClear', DeviceId.userIO, IOCommand.clearMatrix, [], Target.st);
  }

  async rotation (rotation: FrameRotation, owner?: string): Promise<void> {
    if (!this.free('matrixRotation', owner)) return;
    await this.send('matrixRotation', DeviceId.userIO, IOCommand.setMatrixRotation, [rotation], Target.st);
    this.ctx.status.matrix.rotation = rotation;
  }

  /** Up to 25 characters; speed 1..31. The `scrolldone` event marks the end. */
  async scrollText (text: string, color: Color, speed = 10, repeat = false, owner?: string): Promise<void> {
    if (!this.free('matrixScrollText', owner)) return;
    const chars = [...text.slice(0, 25)].map(c => c.charCodeAt(0) & 0xff);
    await this.send('matrixScrollText', DeviceId.userIO, IOCommand.scrollMatrixText, [...color, clamp(speed, 1, 31), repeat ? 1 : 0, ...chars, 0], Target.st);
  }

}
