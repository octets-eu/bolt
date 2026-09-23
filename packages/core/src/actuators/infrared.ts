import type { Context } from '../context';
import { DeviceId, SensorCommand, Target } from '../protocol/constants';
import type { AckPayload } from '../protocol/payloads';
import type { Ack } from '../protocol/queue';

export interface InfraredStrengths { front: number; left: number; right: number; rear: number }

/** The four infrared emitters. Receiving is a sensor stream, see `sensors.infrared`. */
export class Infrared {

  private readonly ctx: Context;

  constructor (ctx: Context) {
    this.ctx = ctx;
  }

  /** One packet; named `packet` because `send` is the public command here. */
  private packet<N extends string> (name: N, device: DeviceId, id: number, data: readonly number[], target: Target): Promise<Ack<AckPayload<N>>> {
    return this.ctx.queue.send({ name, device, id, target, data });
  }

  /** Emit `code` (0..7) on the four emitters at the given strengths (0..255). */
  async send (code: number, strengths: InfraredStrengths | number = 255): Promise<void> {
    const s = typeof strengths === 'number' ? { front: strengths, left: strengths, right: strengths, rear: strengths } : strengths;
    await this.packet('infrared', DeviceId.sensor, SensorCommand.sendInfraredMessage, [code & 7, s.front, s.left, s.right, s.rear], Target.st);
  }

}
