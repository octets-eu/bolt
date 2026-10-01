import type { Context } from '../context';
import { DeviceId, IOCommand, Target } from '../protocol/constants';
import type { AckPayload } from '../protocol/payloads';
import type { Ack } from '../protocol/queue';
import type { FrameRotation } from '../protocol/constants';
import type { Color } from '../config';
import { BLACK, IMAGES, RED } from '../communication/images';
import type { Image } from '../communication/images';
import { clamp } from '../helpers/utils';

type Mode = 'show' | 'blink' | 'flash';
type ImageName = keyof typeof IMAGES;
interface Layer { readonly id: number; readonly mode: Mode }

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
  private stack: Layer[] = [];
  private stored = new Map<string, number>();
  private nextFrame = 0;
  private playing = false;
  /** animationdone notifies still due for animations a play or a stop replaced. */
  private replaced = 0;

  constructor (ctx: Context) {
    this.ctx = ctx;
    // a play or a stop over a running animation reports it done too (2026-10-01)
    ctx.events.on('animationdone', () => {
      if (this.replaced) { this.replaced--; return; }
      this.playing = false;
      if (this.stack.at(-1)?.mode === 'flash') void this.pop();
    });
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
    await this.stop();
    await this.send('matrixColor', DeviceId.userIO, IOCommand.setMatrixColor, [...color], Target.st);
  }

  async pixel (x: number, y: number, color: Color, owner?: string): Promise<void> {
    if (!this.free('matrixPixel', owner)) return;
    await this.stop();
    await this.send('matrixPixel', DeviceId.userIO, IOCommand.setMatrixPixel, [x, y, ...color], Target.st);
  }

  async char (char: string, color: Color, owner?: string): Promise<void> {
    if (!this.free('matrixChar', owner)) return;
    await this.stop();
    await this.send('matrixChar', DeviceId.userIO, IOCommand.setMatrixChar, [...color, char.charCodeAt(0)], Target.st);
  }

  async fill (x0: number, y0: number, x1: number, y1: number, color: Color, owner?: string): Promise<void> {
    if (!this.free('matrixFill', owner)) return;
    await this.stop();
    await this.send('matrixFill', DeviceId.userIO, IOCommand.fillMatrix, [x0, y0, x1, y1, ...color], Target.st);
  }

  async line (x0: number, y0: number, x1: number, y1: number, color: Color, owner?: string): Promise<void> {
    if (!this.free('matrixLine', owner)) return;
    await this.stop();
    await this.send('matrixLine', DeviceId.userIO, IOCommand.drawMatrixLine, [x0, y0, x1, y1, ...color], Target.st);
  }

  /** Clears the matrix and stops a running animation. */
  async clear (owner?: string): Promise<void> {
    if (!this.free('matrixClear', owner)) return;
    if (this.playing) this.replaced++;
    await this.send('matrixClear', DeviceId.userIO, IOCommand.clearMatrix, [], Target.st);
    this.playing = false;
  }

  async rotation (rotation: FrameRotation, owner?: string): Promise<void> {
    if (!this.free('matrixRotation', owner)) return;
    await this.send('matrixRotation', DeviceId.userIO, IOCommand.setMatrixRotation, [rotation], Target.st);
    this.ctx.status.matrix.rotation = rotation;
  }

  /**
   * The matrix as a stack of animations stored on the Bolt, in its matrix
   * colour; nothing goes over Bluetooth while one runs. `animate` sets the
   * base, `push` lays one on top, `pop` plays the one below again (one
   * command: each animation is stored once, on first use). show: the first
   * image, held. blink: the images in turn, 2 per second, looped. flash:
   * three times, 8 per second, in full red, then it pops itself on
   * `animationdone`. A single image blinks and flashes with dark. Each
   * layer keeps the palette it was stored with. Any other write stops the
   * running animation.
   */
  async animate (mode: Mode, ...names: ImageName[]): Promise<void> {
    if (!this.free('matrixAnimate')) return;
    this.stack = [await this.store(mode, names)];
    await this.play();
  }

  async push (mode: Mode, ...names: ImageName[]): Promise<void> {
    if (!this.free('matrixPush')) return;
    const layer = await this.store(mode, names);
    // a flash on a flash restarts it instead of stacking a second one
    if (mode === 'flash' && this.stack.at(-1)?.mode === 'flash') this.stack.pop();
    this.stack.push(layer);
    await this.play();
  }

  async pop (): Promise<void> {
    if (!this.free('matrixPop')) return;
    this.stack.pop();
    if (this.stack.length) await this.play();
    else await this.clear();
  }

  private async play (): Promise<void> {
    const top = this.stack.at(-1)!;
    if (this.playing) this.replaced++;
    await this.send('matrixPlayAnimation', DeviceId.userIO, IOCommand.playMatrixAnimation, [top.id, top.mode === 'flash' ? 0 : 1], Target.st);
    this.playing = true;
  }

  /** Stop a running animation before a plain write, for any owner: clear stops it. */
  private async stop (): Promise<void> {
    if (!this.playing) return;
    this.replaced++;
    await this.send('matrixClear', DeviceId.userIO, IOCommand.clearMatrix, [], Target.st);
    this.playing = false;
  }

  /**
   * The animation for `mode` and `names`, stored on first use. A frame is 4
   * bit planes of a palette index per pixel, 8 bytes each: byte k is column
   * 7 - k, bit r is row r, so a frame shows like `showImage` (2026-10-01;
   * spherov2's row order showed it turned 90 degrees clockwise). The first
   * store of a page session deletes what an earlier one left.
   */
  private async store (mode: Mode, names: readonly ImageName[]): Promise<Layer> {
    const key = `${mode} ${names.join(' ')}`;
    const known = this.stored.get(key);
    if (known !== undefined) return { id: known, mode };
    if (!this.stored.size) {
      await this.send('matrixDeleteAnimations', DeviceId.userIO, IOCommand.deleteMatrixAnimations, [], Target.st);
      this.nextFrame = 0;
    }
    const images: Image[] = names.map(n => IMAGES[n]);
    if (images.length === 1 && mode !== 'show') images.push([]);
    const frames = mode === 'flash' ? [...images, ...images, ...images] : mode === 'show' ? images.slice(0, 1) : images;
    const indexes: number[] = [];
    for (const frame of frames) {
      const index = this.nextFrame++;
      const planes: number[] = [];
      for (let bit = 0; bit < 4; bit++) {
        for (let k = 0; k < 8; k++) {
          let byte = 0;
          for (let row = 0; row < 8; row++) byte |= (((frame[row]?.[7 - k] ?? 0) >> bit) & 1) << row;
          planes.push(byte);
        }
      }
      await this.send('matrixSaveFrame', DeviceId.userIO, IOCommand.saveMatrixFrame, [index >> 8, index & 0xff, ...planes], Target.st);
      indexes.push(index);
    }
    const lit = mode === 'flash' ? RED : this.ctx.config.colors.matrix;
    const id = this.stored.size;
    const list = [indexes.length, ...indexes].flatMap(v => [v >> 8, v & 0xff]);
    await this.send('matrixSaveAnimation', DeviceId.userIO, IOCommand.saveMatrixAnimation, [id, mode === 'flash' ? 8 : 2, 0, 2, ...BLACK, ...lit, ...list], Target.st);
    this.stored.set(key, id);
    return { id, mode };
  }

  /** Indexes of the animation frames stored on the Bolt. */
  async frames (): Promise<number[]> {
    const { raw } = await this.send('matrixFrames', DeviceId.userIO, IOCommand.listMatrixFrames, [], Target.st);
    const out: number[] = [];
    for (let i = 0; i + 1 < raw.length; i += 2) out.push((raw[i]! << 8) | raw[i + 1]!);
    return out;
  }

  /** Up to 25 characters; speed 1..31. The `scrolldone` event marks the end. */
  async scrollText (text: string, color: Color, speed = 10, repeat = false, owner?: string): Promise<void> {
    if (!this.free('matrixScrollText', owner)) return;
    await this.stop();
    const chars = [...text.slice(0, 25)].map(c => c.charCodeAt(0) & 0xff);
    await this.send('matrixScrollText', DeviceId.userIO, IOCommand.scrollMatrixText, [...color, clamp(speed, 1, 31), repeat ? 1 : 0, ...chars, 0], Target.st);
  }

}
