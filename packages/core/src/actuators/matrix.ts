import type { Context } from '../context';
import { DeviceId, IOCommand, Target } from '../protocol/constants';
import type { AckPayload } from '../protocol/payloads';
import type { Ack } from '../protocol/queue';
import type { FrameRotation } from '../protocol/constants';
import type { Color } from '../config';
import { BLACK, IMAGES, RED, WHITE } from '../communication/images';
import type { Image, ImageName } from '../communication/images';
import { clamp } from '../helpers/utils';
import { CommandError } from '../errors';

type Mode = 'show' | 'blink' | 'flash';
interface Layer { readonly id: number; readonly mode: Mode }
/**
 * The two frame indexes and animation ids `picture` keeps, clear of the
 * stack's, which count from 0. An animation id of 63 and up is refused with
 * badParameterValue, 32 is accepted; frame indexes 0 to 1000 are, 1001 and
 * up refused (2026-11-08). Two of each because a frame rewritten while on
 * display goes dark until the next play, a blink at every redraw
 * (2026-11-08): a draw writes the other slot and plays that one.
 */
const PICTURE_FRAMES = [999, 1000] as const, PICTURE_IDS = [31, 32] as const;

/**
 * A frame's 4 bit planes of a palette index per pixel, 8 bytes each: byte k
 * is column 7 - k, bit r is row r, so a frame shows like `showImage`
 * (2026-10-01; spherov2's row order showed it turned 90 degrees clockwise).
 */
function planes (pixel: (row: number, col: number) => number): number[] {
  const out: number[] = [];
  for (let bit = 0; bit < 4; bit++) {
    for (let k = 0; k < 8; k++) {
      let byte = 0;
      for (let row = 0; row < 8; row++) byte |= ((pixel(row, 7 - k) >> bit) & 1) << row;
      out.push(byte);
    }
  }
  return out;
}

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
  /** The palette stored with the picture's two animations, null when the slots are empty. */
  private palette: string | null = null;
  /** The picture slot on display, 0 or 1. */
  private shown = 1;
  private turn: Promise<unknown> = Promise.resolve();
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
    // sleep wipes what is stored on the Bolt (2026-10-03: no frames listed after a wake, the play of a stored id failed)
    ctx.events.on('didsleep', () => {
      this.stack = [];
      this.stored.clear();
      this.palette = null;
      this.playing = false;
      this.replaced = 0;
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
   * The matrix as a stack of animations stored on the Bolt; nothing goes
   * over Bluetooth while one runs. `animate` replaces the base, under any
   * layer on top; `push` lays one on top; `pop` plays the one below again
   * (one command: each animation is stored once, on first use). show: the
   * first image, held. blink: the images in turn, 2 per second, looped.
   * flash: three times, 8 per second, then it pops itself on
   * `animationdone`. A single image blinks and flashes with dark. `mark` is
   * laid over every frame and does not blink. Image pixels index the
   * palette black, colour, white; the colour is the Bolt's matrix colour,
   * red for a flash. Stack changes run in call order. Any other write stops
   * the running animation.
   */
  animate (mode: Mode, names: readonly ImageName[], mark: ImageName | null = null): Promise<void> {
    return this.inTurn(async () => {
      if (!this.free('matrixAnimate')) return;
      this.stack[0] = await this.store(mode, names, mark);
      if (this.stack.length === 1) await this.play();
    });
  }

  push (mode: Mode, ...names: ImageName[]): Promise<void> {
    return this.inTurn(async () => {
      if (!this.free('matrixPush')) return;
      const layer = await this.store(mode, names, null);
      // a flash on a flash restarts it instead of stacking a second one
      if (mode === 'flash' && this.stack.length > 1 && this.stack.at(-1)?.mode === 'flash') this.stack.pop();
      this.stack.push(layer);
      await this.play();
    });
  }

  pop (): Promise<void> {
    return this.inTurn(async () => {
      if (!this.free('matrixPop')) return;
      this.stack.pop();
      if (this.stack.length) await this.play();
      else await this.clear();
    });
  }

  /** One stack change after the other; a failed one does not block the next. */
  private inTurn (step: () => Promise<void>): Promise<void> {
    const run = this.turn.then(step);
    this.turn = run.then(undefined, () => undefined);
    return run;
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
   * The animation for `mode`, `names` and `mark`, stored on first use. The
   * first store of a page session deletes what an earlier one left, the
   * picture's slot too.
   */
  private async store (mode: Mode, names: readonly ImageName[], mark: ImageName | null): Promise<Layer> {
    const key = `${mode} ${names.join(' ')} ${mark ?? ''}`;
    const known = this.stored.get(key);
    if (known !== undefined) return { id: known, mode };
    if (!this.stored.size) {
      await this.send('matrixDeleteAnimations', DeviceId.userIO, IOCommand.deleteMatrixAnimations, [], Target.st);
      this.nextFrame = 0;
      this.palette = null;
    }
    const images: Image[] = names.length ? names.map(n => IMAGES[n]) : [[]];
    if (images.length === 1 && mode !== 'show') images.push([]);
    const frames = mode === 'flash' ? [...images, ...images, ...images] : mode === 'show' ? images.slice(0, 1) : images;
    const over = mark ? IMAGES[mark] : [];
    const indexes: number[] = [];
    for (const frame of frames) {
      const index = this.nextFrame++;
      const pixel = (row: number, col: number) => over[row]?.[col] || frame[row]?.[col] || 0;
      await this.send('matrixSaveFrame', DeviceId.userIO, IOCommand.saveMatrixFrame, [index >> 8, index & 0xff, ...planes(pixel)], Target.st);
      indexes.push(index);
    }
    const palette = [BLACK, mode === 'flash' ? RED : this.ctx.config.colors.matrix, WHITE];
    const id = this.stored.size;
    const list = [indexes.length, ...indexes].flatMap(v => [v >> 8, v & 0xff]);
    await this.send('matrixSaveAnimation', DeviceId.userIO, IOCommand.saveMatrixAnimation, [id, mode === 'flash' ? 8 : 2, 0, palette.length, ...palette.flat(), ...list], Target.st);
    this.stored.set(key, id);
    return { id, mode };
  }

  /**
   * A whole picture in one go: `pixels` 8 rows of 8 palette indexes, row 0
   * at the back, `palette` up to 16 colours, index 0 the first. Kept in two
   * frame slots with an animation each; a frame saved again under its index
   * and its animation played shows the new picture (2026-11-08), so an
   * update is two commands, about 150 ms; a new palette stores both
   * animations first, 56 bytes each, which the link under load may not ack.
   * Any other write stops it like an animation.
   */
  async picture (pixels: readonly (readonly number[])[], palette: readonly Color[], owner?: string): Promise<void> {
    if (!this.free('matrixPicture', owner)) return;
    if (palette.length < 1 || palette.length > 16) throw new Error(`matrix picture: ${palette.length} colours, 1 to 16 allowed`);
    const key = palette.flat().join();
    if (key !== this.palette) {
      for (const [k, id] of PICTURE_IDS.entries()) {
        const frame = PICTURE_FRAMES[k]!;
        await this.send('matrixSaveAnimation', DeviceId.userIO, IOCommand.saveMatrixAnimation, [id, 2, 0, palette.length, ...palette.flat(), 0, 1, frame >> 8, frame & 0xff], Target.st);
      }
      this.palette = key;
    }
    const slot = 1 - this.shown, frame = PICTURE_FRAMES[slot]!, id = PICTURE_IDS[slot]!;
    await this.send('matrixSaveFrame', DeviceId.userIO, IOCommand.saveMatrixFrame, [frame >> 8, frame & 0xff, ...planes((row, col) => pixels[row]?.[col] ?? 0)], Target.st);
    if (this.playing) this.replaced++;
    try { await this.send('matrixPlayAnimation', DeviceId.userIO, IOCommand.playMatrixAnimation, [id, 1], Target.st); }
    catch (e) {
      // the animations are gone when the stack's first store deleted all animations between the save and the play (seen at connect, 2026-11-08)
      if (!(e instanceof CommandError) || this.palette === null) throw e;
      this.palette = null;
      return this.picture(pixels, palette, owner);
    }
    this.shown = slot;
    this.playing = true;
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
