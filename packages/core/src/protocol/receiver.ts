import { DeviceId, IONotify, PowerNotify, SensorNotify } from './constants';
import { PacketParser } from './packet';
import type { Packet } from './packet';
import * as payloads from './payloads';
import type { Queue } from './queue';
import type { Emitter } from '../events/emitter';
import type { BoltEvents, LogType, PacketSummary } from '../events/events';

export type LogFn = (type: LogType, subtype: string, data?: unknown) => void;

function summary (p: Packet): PacketSummary {
  return { id: p.seq, device: p.device, command: p.command, target: p.target, payload: p.payload };
}

/**
 * Bytes in, acks to the queue, notifications out as typed events. Every packet
 * is also logged so the session log holds what the Bolt actually sent.
 */
export class Receiver {

  private readonly parser = new PacketParser();
  private readonly queue:  Queue;
  private readonly events: Emitter<BoltEvents>;
  private readonly log:    LogFn;
  private readonly now:    () => number;

  constructor (queue: Queue, events: Emitter<BoltEvents>, log: LogFn, now: () => number = () => Date.now()) {
    this.queue  = queue;
    this.events = events;
    this.log    = log;
    this.now    = now;
  }

  feed (bytes: Uint8Array): void {
    this.parser.feed(
      bytes,
      (packet) => this.dispatch(packet),
      (reason, raw) => this.log('warn', `packet ${reason}`, raw),
    );
  }

  private dispatch (packet: Packet): void {

    if (packet.kind === 'response') {
      const known = this.queue.acknowledge(packet);
      this.log('event', 'ack', { msg: summary(packet) });
      if (!known) this.log('warn', 'ack for unknown sequence', summary(packet));
      return;
    }

    const msg = summary(packet);
    const { payload } = packet;

    switch (packet.device) {

      case DeviceId.power:
        switch (packet.command) {
          case PowerNotify.awake:
            this.notify('awake', undefined, msg);
            return;
          case PowerNotify.willSleep:
            this.notify('willsleep', undefined, msg);
            return;
          case PowerNotify.didSleep:
            this.notify('didsleep', undefined, msg);
            return;
          case PowerNotify.batteryVoltageState: {
            const state = payloads.batteryState(payload);
            this.notify('battery', { state }, msg, { battery: state });
            return;
          }
          case PowerNotify.chargerState:        {
            const state = payloads.chargerState(payload);
            this.notify('charger', { state }, msg, { charger: state });
            return;
          }
        }
        break;

      case DeviceId.sensor:
        switch (packet.command) {
          case SensorNotify.streamingData:
            this.events.emit('stream', { payload });
            this.events.emit('change', undefined);
            return;  // the sensor layer logs the parsed sample
          case SensorNotify.gyroMax:
            this.notify('gyromax', { payload }, msg);
            return;
          case SensorNotify.collision:       {
            const c = payloads.collision(payload, this.now());
            this.notify('collision', c, msg, c);
            return;
          }
          case SensorNotify.compassNorthYaw: {
            const angle = payloads.compassAngle(payload) ?? 0;
            this.notify('compass', { angle }, msg, { angle });
            return;
          }
          case SensorNotify.infraredMessage:
            this.notify('infrared', { payload }, msg, payload);
            return;
        }
        break;

      case DeviceId.userIO:
        switch (packet.command) {
          case IONotify.scrollTextDone:
            this.notify('scrolldone', undefined, msg);
            return;
          case IONotify.animationComplete:
            this.notify('animationdone', undefined, msg);
            return;
        }
        break;
    }

    this.log('warn', `unknown notification device 0x${packet.device.toString(16)} command 0x${packet.command.toString(16)}`, msg);
    this.events.emit('unknown', packet);

  }

  /** Log, emit, and say the visible state changed: every notification may have written the status. */
  private notify<K extends keyof BoltEvents> (name: K, payload: BoltEvents[K], msg: PacketSummary, sensordata?: unknown): void {
    this.log('event', String(name), sensordata === undefined ? { msg } : { msg, sensordata });
    this.events.emit(name, payload);
    this.events.emit('change', undefined);
  }

}
