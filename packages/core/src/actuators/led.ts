import type { Context } from '../context';
import { DeviceId, IOCommand } from '../protocol/constants';
import type { Color } from '../config';

/** Bit mask of the six LED channels the payload carries: front R, G, B and back R, G, B. */
const ALL_LEDS = 0b111111;

/** The front and back LEDs. */
export class Led {

  private readonly ctx: Context;

  constructor (ctx: Context) {
    this.ctx = ctx;
  }

  async set (front: Color, back: Color = front): Promise<void> {
    await this.ctx.queue.send({ name: 'setLeds', device: DeviceId.userIO, id: IOCommand.setAllLeds, data: [ALL_LEDS, ...front, ...back] });
  }

}
