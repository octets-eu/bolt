import { ErrorCode } from './constants';
import { encode } from './packet';
import type { Command, Packet } from './packet';
import { ackDecoder } from './payloads';
import type { AckPayload, Bytes } from './payloads';
import type { Transport } from './transport';
import { AckTimeoutError, CommandError, NotConnectedError, WriteError } from '../errors';
import type { PacketSummary } from '../events/events';

/** A command's acknowledgement. `payload` is the decoded value for the command name, see `AckPayloads`; `raw` the bytes. */
export interface Ack<T = undefined> {
  readonly seq:     number;
  readonly error:   number;
  readonly payload: T;
  readonly raw:     Bytes;
}

export interface QueueOptions {
  /** GATT write with response (default): the write rejects on link errors instead of timing out on the ack. */
  withResponse?: boolean;
  ackTimeoutMs?: number;
}

export interface QueueHooks {
  /** A packet is about to be written. */
  onAction?:     (action: PacketSummary & { readonly name: string }) => void;
  onChange?:     () => void;
}

interface Pending {
  readonly seq:     number;
  readonly command: Command;
  readonly bytes:   Uint8Array;
  readonly resolve: (ack: Ack<unknown>) => void;
  readonly reject:  (error: Error) => void;
  timer:    ReturnType<typeof setTimeout> | null;
}

/**
 * Strictly serial command queue: one packet in flight until its ack arrives,
 * times out or the write fails. Sequence numbers 0..254; 255 is the firmware's
 * notification marker. `fire` is the one way past the lane: a write without
 * response under a sequence number of its own, for reads that must land
 * milliseconds apart.
 */
export class Queue {

  readonly withResponse: boolean;
  readonly ackTimeoutMs: number;

  private readonly transport: Transport;
  private readonly hooks:     QueueHooks;

  private seq      = 0;
  private waiting: Pending[] = [];
  private inflight: Pending | null = null;
  /** Fired commands waiting for their ack, by sequence number. */
  private readonly fired = new Map<number, Pending>();

  constructor (transport: Transport, options: QueueOptions = {}, hooks: QueueHooks = {}) {
    this.transport    = transport;
    this.hooks        = hooks;
    this.withResponse = options.withResponse ?? true;
    this.ackTimeoutMs = options.ackTimeoutMs ?? 3000;
  }

  /** Commands queued or in flight. */
  get pending (): number { return this.waiting.length + (this.inflight ? 1 : 0); }

  /**
   * Queue a command; resolves with its ack, the payload decoded by the command
   * name, rejects with CommandError, AckTimeoutError or WriteError.
   */
  send<N extends string> (command: Command & { readonly name: N }): Promise<Ack<AckPayload<N>>> {
    return new Promise<Ack<unknown>>((resolve, reject) => {
      if (!this.transport.connected) {
        reject(new NotConnectedError(this.transport.name));
        return;
      }
      const seq = this.nextSeq();
      this.waiting.push({ seq, command, bytes: encode(seq, command), resolve, reject, timer: null });
      this.kick();
    }) as Promise<Ack<AckPayload<N>>>;
  }

  /**
   * Write a command at once, past the serial lane and without a GATT
   * response, under a sequence number of its own: for reads that must land
   * milliseconds apart, which one packet in flight at a time cannot give.
   * The Bolt answers fired commands in the order sent (2026-10-04: 150 of
   * 150 pairs, volleys of three and five; 6 of 540 writes 6 ms apart failed
   * with "GATT operation already in progress"). Resolves with the ack;
   * rejects with WriteError, or AckTimeoutError after `timeoutMs`.
   */
  fire<N extends string> (command: Command & { readonly name: N }, timeoutMs = 90): Promise<Ack<AckPayload<N>>> {
    return new Promise<Ack<unknown>>((resolve, reject) => {
      if (!this.transport.connected) {
        reject(new NotConnectedError(this.transport.name));
        return;
      }
      const seq = this.nextSeq();
      const pending: Pending = { seq, command, bytes: encode(seq, command), resolve, reject, timer: null };
      this.fired.set(seq, pending);
      this.hooks.onAction?.({ id: seq, name: command.name, device: command.device, command: command.id, target: command.target ?? null, payload: command.data });
      this.transport.write(pending.bytes, false).then(
        () => { if (this.fired.get(seq) === pending) pending.timer = setTimeout(() => this.timeoutFired(pending), timeoutMs); },
        (error: unknown) => {
          if (this.fired.get(seq) !== pending) return;
          this.forget(pending);
          reject(new WriteError(command.name, error));
        },
      );
    }) as Promise<Ack<AckPayload<N>>>;
  }

  /** Called by the receiver for every response packet. False when no command waits for that sequence number. */
  acknowledge (packet: Packet): boolean {
    const lane = this.inflight !== null && this.inflight.seq === packet.seq;
    const pending = lane ? this.inflight : this.fired.get(packet.seq);
    if (!pending) return false;
    if (lane) this.finish(pending);
    else this.forget(pending);
    const error = packet.error ?? ErrorCode.success;
    if (error === ErrorCode.success) {
      const decode = ackDecoder(pending.command.name);
      pending.resolve({ seq: packet.seq, error, payload: decode ? decode(packet.payload) : undefined, raw: packet.payload });
    }
    else pending.reject(new CommandError(pending.command.name, error));
    if (lane) this.kick();
    return true;
  }

  /** Reject everything, e.g. on disconnect. */
  clear (reason: Error): void {
    const all = this.inflight ? [this.inflight, ...this.waiting, ...this.fired.values()] : [...this.waiting, ...this.fired.values()];
    this.waiting = [];
    if (this.inflight) this.finish(this.inflight);
    for (const p of [...this.fired.values()]) this.forget(p);
    for (const p of all) p.reject(reason);
  }

  private nextSeq (): number {
    this.seq = (this.seq + 1) % 255;
    return this.seq;
  }

  private kick (): void {
    if (this.inflight) return;
    const next = this.waiting.shift();
    if (!next) return;
    this.inflight = next;
    void this.write(next);
  }

  private async write (pending: Pending): Promise<void> {

    const { command, bytes, seq } = pending;
    this.hooks.onAction?.({ id: seq, name: command.name, device: command.device, command: command.id, target: command.target ?? null, payload: command.data });

    // no retry: in 289 sessions of 2026-09 no retried write went through, a
    // failed write came with a disconnect or before the link was up
    try {
      await this.transport.write(bytes, this.withResponse);
    } catch (error) {
      if (this.inflight !== pending) return;  // cleared meanwhile
      this.finish(pending);
      pending.reject(new WriteError(command.name, error));
      this.kick();
      return;
    }

    if (this.inflight !== pending) return;  // cleared meanwhile
    pending.timer = setTimeout(() => this.timeout(pending), this.ackTimeoutMs);

  }

  private timeout (pending: Pending): void {
    if (this.inflight !== pending) return;
    this.finish(pending);
    pending.reject(new AckTimeoutError(pending.command.name, this.ackTimeoutMs));
    this.kick();
  }

  private timeoutFired (pending: Pending): void {
    if (this.fired.get(pending.seq) !== pending) return;
    this.forget(pending);
    pending.reject(new AckTimeoutError(pending.command.name, 0));
  }

  private forget (pending: Pending): void {
    if (pending.timer !== null) {
      clearTimeout(pending.timer);
      pending.timer = null;
    }
    this.fired.delete(pending.seq);
  }

  private finish (pending: Pending): void {
    if (pending.timer !== null) {
      clearTimeout(pending.timer);
      pending.timer = null;
    }
    if (this.inflight === pending) this.inflight = null;
    this.hooks.onChange?.();
  }

}
