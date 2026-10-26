import { connect as netConnect } from 'node:net';
import type { Socket } from 'node:net';
import type { Transport } from '@bolt/core';

type FrameListener = (bytes: Uint8Array) => void;

/** client -> bridge */
const WRITE_RESP = 0x01, WRITE_NORESP = 0x02, HEARTBEAT = 0x03;
/** bridge -> client */
const FRAME = 0x11, WRITTEN = 0x12, WRITE_FAILED = 0x13, LINK = 0x20;

export interface SocketTransportOptions {
  /** The bridge host; the colima default route to the host is 192.168.5.2, loopback otherwise. */
  host?: string;
  /** Liveness to the bridge: with no message for the bridge's deadman the Bolt's motors are cut. */
  heartbeatMs?: number;
}

/**
 * The core Transport over a TCP socket to the Bolt bridge (Rig/bridge/bridge.py),
 * the one host process that holds the Bluetooth link. One socket per Bolt, to
 * the bridge's per-Bolt port. The bridge does the anti-DoS unlock and the
 * reconnect; this side speaks the bridge's framing and nothing of GATT.
 *
 * Wire framing both ways: type (1 byte), length (2 big-endian), payload.
 * A write with response resolves on the bridge's `written`, one per write in
 * order; a write without response resolves once the bytes are on the socket.
 * The bridge forwards each BLE notification as its own `frame`, so a packet
 * arrives in pieces and `onFrame` hands them straight to core's PacketParser.
 * A heartbeat every `heartbeatMs` keeps the bridge's deadman from cutting the
 * motors while the controller is alive but quiet, e.g. a standing sweep round.
 */
export class SocketTransport implements Transport {

  readonly name: string;
  private readonly host: string;
  private readonly port: number;
  private readonly heartbeatMs: number;

  private socket: Socket | null = null;
  private linkUp = false;
  private ready  = false;
  private buffer: Uint8Array = new Uint8Array(0);
  /** Resolvers for writes with response, in the order sent; the bridge answers in that order. */
  private readonly pendingWrites: { resolve: () => void; reject: (error: Error) => void }[] = [];
  private frameListeners: FrameListener[] = [];
  private disconnectListeners: (() => void)[] = [];
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  constructor (name: string, port: number, options: SocketTransportOptions = {}) {
    this.name = name;
    this.port = port;
    this.host = options.host ?? '127.0.0.1';
    this.heartbeatMs = options.heartbeatMs ?? 1000;
  }

  /** True only while a write can succeed: the socket is open and the bridge says the Bolt's link is up. */
  get connected (): boolean {
    return this.ready && this.linkUp && this.socket !== null && !this.socket.destroyed;
  }

  /** Open the socket and resolve once the bridge reports the Bolt's link up, or reject on timeout. */
  connect (timeoutMs = 10000): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const socket = netConnect({ host: this.host, port: this.port });
      this.socket = socket;

      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`${this.name}: no link up from the bridge within ${timeoutMs} ms`));
      }, timeoutMs);

      let settled = false;
      const up = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.ready = true;
        this.startHeartbeat();
        resolve();
      };

      socket.on('connect', () => socket.setNoDelay(true));
      socket.on('data', (chunk) => this.onData(chunk, up));
      socket.on('error', (error) => {
        if (!settled) { settled = true; clearTimeout(timer); reject(error); }
        this.onClosed();
      });
      socket.on('close', () => {
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error(`${this.name}: socket closed before link up`)); }
        this.onClosed();
      });
    });
  }

  private startHeartbeat (): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      if (this.socket && !this.socket.destroyed) this.socket.write(frame(HEARTBEAT));
    }, this.heartbeatMs);
    this.heartbeat.unref?.();
  }

  private stopHeartbeat (): void {
    if (this.heartbeat) { clearInterval(this.heartbeat); this.heartbeat = null; }
  }

  private onData (chunk: Uint8Array, onLinkUp: () => void): void {
    if (this.buffer.length) {
      const joined = new Uint8Array(this.buffer.length + chunk.length);
      joined.set(this.buffer);
      joined.set(chunk, this.buffer.length);
      this.buffer = joined;
    } else {
      this.buffer = chunk;
    }
    while (this.buffer.length >= 3) {
      const kind   = this.buffer[0]!;
      const length = (this.buffer[1]! << 8) | this.buffer[2]!;
      if (this.buffer.length < 3 + length) break;
      const payload = this.buffer.subarray(3, 3 + length);
      this.buffer = this.buffer.slice(3 + length);
      this.handle(kind, payload, onLinkUp);
    }
  }

  private handle (kind: number, payload: Uint8Array, onLinkUp: () => void): void {
    switch (kind) {
      case FRAME: {
        const bytes = payload.slice();
        for (const listener of this.frameListeners) listener(bytes);
        break;
      }
      case WRITTEN:
        this.pendingWrites.shift()?.resolve();
        break;
      case WRITE_FAILED:
        this.pendingWrites.shift()?.reject(new Error(`${this.name}: ${new TextDecoder().decode(payload)}`));
        break;
      case LINK:
        if (payload[0] === 1) { this.linkUp = true; onLinkUp(); }
        else if (this.linkUp) { this.linkUp = false; this.fireDisconnect(); }
        break;
      default:
        break;
    }
  }

  private onClosed (): void {
    this.stopHeartbeat();
    const wasLive = this.ready || this.linkUp;
    this.ready = false;
    this.linkUp = false;
    while (this.pendingWrites.length) this.pendingWrites.shift()!.reject(new Error(`${this.name}: socket closed`));
    if (wasLive) this.fireDisconnect();
  }

  private fireDisconnect (): void {
    for (const listener of this.disconnectListeners) listener();
  }

  /** One packet to the bridge, which chunks it to the 20-byte GATT limit itself. */
  write (bytes: Uint8Array, withResponse = true): Promise<void> {
    const socket = this.socket;
    if (!socket || socket.destroyed) return Promise.reject(new Error(`${this.name}: not connected`));
    if (!withResponse) {
      socket.write(frame(WRITE_NORESP, bytes));
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      this.pendingWrites.push({ resolve, reject });
      socket.write(frame(WRITE_RESP, bytes));
    });
  }

  onFrame (listener: FrameListener): void {
    this.frameListeners.push(listener);
  }

  onDisconnect (listener: () => void): void {
    this.disconnectListeners.push(listener);
  }

  close (): void {
    this.stopHeartbeat();
    this.ready = false;
    this.linkUp = false;
    this.socket?.destroy();
    this.socket = null;
  }

}

/** A bridge message: type, length (2 big-endian), payload. */
function frame (kind: number, payload: Uint8Array = new Uint8Array(0)): Uint8Array {
  const out = new Uint8Array(3 + payload.length);
  out[0] = kind;
  out[1] = (payload.length >> 8) & 0xff;
  out[2] = payload.length & 0xff;
  out.set(payload, 3);
  return out;
}
