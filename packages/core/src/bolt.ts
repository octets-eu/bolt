import { Actuators } from './actuators/actuators';
import { Behavior } from './behavior/behavior';
import { Calibration } from './calibration/calibration';
import type { BoltConfig } from './config';
import type { Context } from './context';
import { Emitter } from './events/emitter';
import { Experiments } from './experiments/experiments';
import { NotConnectedError } from './errors';
import type { BoltEvents, LogType } from './events/events';
import { Lifecycle } from './lifecycle/lifecycle';
import { Communication } from './communication/communication';
import { Navigation } from './navigation/navigation';
import { Queue } from './protocol/queue';
import { Receiver } from './protocol/receiver';
import type { Transport } from './protocol/transport';
import { Sensors } from './sensors/sensors';
import { Status } from './status/status';

/**
 * One Bolt. Owns the protocol objects and the layers and exposes them; the
 * layers themselves only ever see the Context part of this class.
 *
 *   protocol:  transport, queue, receiver
 *   bottom:    sensors, actuators          one packet per call
 *   middle:    lifecycle, navigation, communication, calibration
 *   behavior     closed loops over the Bolt's own senses, motor only
 *   experiments  sequences under development, console only
 */
export class Bolt implements Context {

  readonly name:      string;
  readonly config:    BoltConfig;
  readonly transport: Transport;
  readonly status:    Status = new Status();
  readonly events     = new Emitter<BoltEvents>();

  readonly queue:       Queue;
  readonly receiver:    Receiver;
  readonly sensors:     Sensors;
  readonly actuators:   Actuators;
  readonly lifecycle:   Lifecycle;
  readonly navigation:  Navigation;
  readonly communication:   Communication;
  readonly calibration: Calibration;
  readonly behavior:    Behavior;
  readonly experiments: Experiments;

  private motionController = new AbortController();

  constructor (name: string, config: BoltConfig, transport: Transport) {

    this.name      = name;
    this.config    = config;
    this.transport = transport;

    this.queue = new Queue(transport, config.queue ?? {}, {
      onAction:     (action) => this.log('action', action.name, action),
      onWriteError: (command, attempt, error) => this.log('warn', `write ${command} try ${attempt}: ${String(error)}`),
      onChange:     () => this.changed(),
    });
    this.receiver = new Receiver(this.queue, this.events, (type, subtype, data) => this.log(type, subtype, data), () => this.now());

    transport.onFrame((bytes) => this.receiver.feed(bytes));
    transport.onDisconnect(() => {
      this.queue.clear(new NotConnectedError(name));
      this.log('info', 'Disconnected');
      this.events.emit('disconnected', undefined);
      this.changed();
    });

    this.sensors     = new Sensors(this);
    this.actuators   = new Actuators(this);
    this.communication   = new Communication(this, this.actuators);
    this.calibration = new Calibration(this, this.actuators, this.sensors, this.communication);
    this.navigation  = new Navigation(this, this.actuators, this.sensors);
    this.lifecycle   = new Lifecycle(this, this.actuators, this.sensors, this.communication, this.calibration, this.navigation);
    this.behavior    = new Behavior(this, this.actuators, this.sensors);
    this.experiments = new Experiments(this, this.actuators, this.sensors, this.navigation);

  }

  get connected (): boolean { return this.transport.connected; }

  /** Commanded heading, degrees. */
  get heading (): number { return this.status.heading; }

  get motion (): AbortSignal { return this.motionController.signal; }

  abortMotion (): void {
    this.motionController.abort();
    this.motionController = new AbortController();
  }

  now (): number { return Date.now(); }

  log (type: LogType, subtype: string, data?: unknown): void {
    this.events.emit('log', { timestamp: this.now(), bolt: this.name, type, subtype, data });
  }

  changed (): void {
    this.events.emit('change', undefined);
  }

  /** console.log arguments that print the name in the Bolt's colour. */
  format (text: string): [string, string] {
    return [`%c${this.name} ${text}`, `color: ${this.config.colors.console}; font-weight: 800`];
  }

}
