import { Byte, Flag, NOTIFICATION_SEQ } from './constants';
import type { DeviceId, Target } from './constants';

/** One command as the layers above describe it; the queue turns it into bytes. */
export interface Command {
  readonly name:    string;
  readonly device:  DeviceId;
  readonly id:      number;
  readonly target?: Target;
  readonly data:    readonly number[];
}

/** One decoded packet from the Bolt. */
export interface Packet {
  readonly kind:    'response' | 'notification';
  readonly flags:   number;
  readonly target:  number | null;
  readonly source:  number | null;
  readonly device:  number;
  readonly command: number;
  readonly seq:     number;
  /** Error code of a response, null on notifications. */
  readonly error:   number | null;
  readonly payload: readonly number[];
  /** Unescaped bytes between start and end, checksum included. */
  readonly raw:     readonly number[];
}

export type DecodeResult =
  | { readonly type: 'packet'; readonly packet: Packet }
  | { readonly type: 'error';  readonly reason: string; readonly raw: readonly number[] };

function pushEscaped (out: number[], b: number): void {
  switch (b) {
    case Byte.start:
      out.push(Byte.escape, Byte.escapedStart);
      break;
    case Byte.escape:
      out.push(Byte.escape, Byte.escapedEscape);
      break;
    case Byte.end:
      out.push(Byte.escape, Byte.escapedEnd);
      break;
    default:          out.push(b);
  }
}

/** Frame a command: flags, optional target, device, command, sequence, data, checksum, escaped. */
export function encode (seq: number, command: Command): Uint8Array {

  const { device, id, target, data } = command;
  const flags = Flag.requestsResponse | Flag.resetsInactivityTimeout | (target === undefined ? 0 : Flag.hasTargetId);

  const body: number[] = [flags];
  if (target !== undefined) body.push(target);
  body.push(device, id, seq);
  for (const b of data) body.push(b & 0xff);

  let sum = 0;
  for (const b of body) sum += b;
  const checksum = ~sum & 0xff;

  const out: number[] = [Byte.start];
  for (const b of body) pushEscaped(out, b);
  pushEscaped(out, checksum);
  out.push(Byte.end);

  return Uint8Array.from(out);

}

/** Decode the unescaped bytes between start and end. */
export function decode (raw: readonly number[]): DecodeResult {

  if (raw.length < 5) return { type: 'error', reason: 'too short', raw };

  let sum = 0;
  for (let i = 0; i < raw.length - 1; i++) sum += raw[i] ?? 0;
  const checksum = raw[raw.length - 1];
  if (checksum !== (~sum & 0xff)) return { type: 'error', reason: 'bad checksum', raw };

  let i = 0;
  const next = (): number => raw[i++] ?? 0;

  const flags  = next();
  const target = flags & Flag.hasTargetId ? next() : null;
  const source = flags & Flag.hasSourceId ? next() : null;
  const device = next();
  const command = next();
  const seq    = next();

  const isResponse = (flags & Flag.isResponse) !== 0 && seq !== NOTIFICATION_SEQ;
  const error   = isResponse ? next() : null;
  const payload = raw.slice(i, raw.length - 1);

  return {
    type: 'packet',
    packet: { kind: isResponse ? 'response' : 'notification', flags, target, source, device, command, seq, error, payload, raw },
  };

}

/** Byte stream to packets. A packet may span several feeds; garbage between packets is dropped. */
export class PacketParser {

  private buffer: number[] = [];
  private inPacket = false;
  private escaped  = false;

  feed (bytes: Uint8Array, onPacket: (packet: Packet) => void, onError: (reason: string, raw: readonly number[]) => void): void {

    for (const b of bytes) {

      if (b === Byte.start) {
        if (this.inPacket && this.buffer.length) onError('start inside packet', this.buffer);
        this.buffer = [];
        this.inPacket = true;
        this.escaped  = false;
        continue;
      }

      if (!this.inPacket) continue;

      if (b === Byte.end) {
        const result = decode(this.buffer);
        if (result.type === 'packet') onPacket(result.packet);
        else onError(result.reason, result.raw);
        this.buffer = [];
        this.inPacket = false;
        continue;
      }

      if (b === Byte.escape) {
        this.escaped = true;
        continue;
      }

      if (this.escaped) {
        this.escaped = false;
        this.buffer.push(b | Byte.escapeMask);
      } else {
        this.buffer.push(b);
      }

    }

  }

}
