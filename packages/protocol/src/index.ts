/**
 * The session file format. Plain JSON, one object per line, two families
 * after the header: what a Bolt reported, and where the camera saw it.
 */

export const PROTOCOL_VERSION = 1;

export interface IEnvelope {
  v: typeof PROTOCOL_VERSION;
  /** Milliseconds since the session started. Monotonic within a session. */
  t: number;
  /** Bolt name such as "SB-9129". "*" addresses every Bolt, or none in particular. */
  bolt: string;
}

/** Something the driver reports: an ack, sensor data, a collision, a log line. */
export interface IEventMessage extends IEnvelope {
  kind: 'event';
  /** e.g. "ack", "sensordata", "collision", "infrared", "battery", "charger", "info", "error", "action". */
  name: string;
  data?: unknown;
}

/** Where a Bolt is on the floor, in centimetres, from whoever can tell. */
export interface IPositionMessage extends IEnvelope {
  kind: 'position';
  x: number;
  y: number;
  /** Degrees, 0 along +y, clockwise seen from above. */
  heading?: number;
  /** 0..1 */
  confidence?: number;
  /** Who measured it, e.g. "camera". */
  source?: string;
}

export type TMessage = IEventMessage | IPositionMessage;

/** First line of a session file. */
export interface ISessionHeader {
  kind: 'session';
  v: typeof PROTOCOL_VERSION;
  id: string;
  /** Wall clock at t = 0, ISO 8601, so sessions from different machines can be aligned. */
  startedAt: string;
  /** Short git hash of the code that wrote the file, "+dirty" if uncommitted changes were in; files before 2026-09-21 have none. */
  commit?: string;
  /** Free text, e.g. what was tried. */
  note?: string;
}

/** One line of a JSONL session file. */
export type TLogLine = ISessionHeader | TMessage;

export function isEvent (m: TLogLine): m is IEventMessage { return m.kind === 'event'; }
export function isPosition (m: TLogLine): m is IPositionMessage { return m.kind === 'position'; }
export function isSessionHeader (m: TLogLine): m is ISessionHeader { return m.kind === 'session'; }

/** Parse one JSONL line; returns null for blank or unparsable lines. */
export function parseLine (line: string): TLogLine | null {
  const s = line.trim();
  if (!s) return null;
  try {
    const o = JSON.parse(s);
    if (o && typeof o === 'object' && typeof o.kind === 'string') return o as TLogLine;
  } catch { /* fall through */ }
  return null;
}
