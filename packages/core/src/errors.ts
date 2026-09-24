import { errorName } from './protocol/constants';

export class BoltError extends Error {
  constructor (message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The Bolt answered with an error code. */
export class CommandError extends BoltError {
  readonly command: string;
  readonly code: number;
  constructor (command: string, code: number) {
    super(`${command}: ${errorName(code)}`);
    this.command = command;
    this.code = code;
  }
}

/** No acknowledgement within the queue's timeout. */
export class AckTimeoutError extends BoltError {
  readonly command: string;
  constructor (command: string, ms: number) {
    super(`${command}: no ack within ${ms} ms`);
    this.command = command;
  }
}

/** The transport refused the bytes. */
export class WriteError extends BoltError {
  readonly command: string;
  constructor (command: string, cause: unknown) {
    super(`${command}: write failed: ${String(cause)}`);
    this.command = command;
  }
}

/** A step ran out of its time budget. */
export class TimeoutError extends BoltError {
  constructor (what: string, ms: number) { super(`${what}: timeout after ${ms} ms`); }
}

export class NotConnectedError extends BoltError {
  constructor (name: string) { super(`${name}: not connected`); }
}
