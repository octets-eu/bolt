import type { BoltConfig } from './config';
import type { Emitter } from './events/emitter';
import type { BoltEvents, LogType } from './events/events';
import type { Queue } from './protocol/queue';
import type { Status } from './status/status';

/**
 * What every layer above the protocol works against. The Bolt facade
 * implements it; layers take the context, never the facade, so nothing
 * below can reach up.
 */
export interface Context {
  readonly name:   string;
  readonly config: BoltConfig;
  readonly status: Status;
  readonly events: Emitter<BoltEvents>;
  readonly queue:  Queue;
  /** Aborts on fullstop. Every step that moves the ball listens to it. */
  readonly motion: AbortSignal;
  /** Abort every running motion step and arm a fresh signal. */
  abortMotion (): void;
  log (type: LogType, subtype: string, data?: unknown): void;
  /**
   * Visible state changed; a UI may redraw. Every finished command and every
   * notification fires it already, so a status write that follows an ack or
   * a notification needs no call. Only writes that follow a timer or a local
   * decision do.
   */
  changed (): void;
  /** Session time in ms. */
  now (): number;
}
