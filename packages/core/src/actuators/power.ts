import type { Context } from '../context';
import { ApiCommand, DeviceId, PowerCommand } from '../protocol/constants';
import type { AckPayload } from '../protocol/payloads';
import type { Ack } from '../protocol/queue';

/** The power side of the firmware, plus the API processor's ping. It acks while the Bolt sleeps; the sensor side does not. */
export class Power {

  private readonly ctx: Context;

  constructor (ctx: Context) {
    this.ctx = ctx;
  }

  private send<N extends string> (name: N, device: DeviceId, id: number, data: readonly number[] = []): Promise<Ack<AckPayload<N>>> {
    return this.ctx.queue.send({ name, device, id, data });
  }

  async ping (): Promise<void>      { await this.send('ping',      DeviceId.apiProcessor, ApiCommand.ping); }
  async wake (): Promise<void>      { await this.send('wake',      DeviceId.power, PowerCommand.wake); }
  /** Soft sleep: still advertises, wakes on command. */
  async sleep (): Promise<void>     { await this.send('sleep',     DeviceId.power, PowerCommand.sleep); }
  /** Deep sleep: needs the charger to wake. */
  async hibernate (): Promise<void> { await this.send('hibernate', DeviceId.power, PowerCommand.deepSleep); }

}
