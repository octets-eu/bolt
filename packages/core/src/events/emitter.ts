import { TimeoutError } from '../errors';

/** Minimal typed event emitter. No DOM EventTarget so it runs anywhere. */

export type Listener<T> = (payload: T) => void;

export interface OnceOptions {
  timeoutMs?: number | undefined;
}

export class Emitter<Events extends Record<string, unknown>> {

  private listeners: { [K in keyof Events]?: Listener<Events[K]>[] } = {};

  on<K extends keyof Events> (event: K, listener: Listener<Events[K]>): () => void {
    (this.listeners[event] ??= []).push(listener);
    return () => this.off(event, listener);
  }

  off<K extends keyof Events> (event: K, listener: Listener<Events[K]>): void {
    const list = this.listeners[event];
    if (!list) return;
    const index = list.indexOf(listener);
    if (index > -1) list.splice(index, 1);
  }

  emit<K extends keyof Events> (event: K, payload: Events[K]): void {
    const list = this.listeners[event];
    if (!list) return;
    for (const listener of [...list]) listener(payload);
  }

  count<K extends keyof Events> (event: K): number {
    return this.listeners[event]?.length ?? 0;
  }

  /** Resolve with the next payload of `event`; reject on timeout. */
  once<K extends keyof Events> (event: K, options: OnceOptions = {}): Promise<Events[K]> {
    return new Promise((resolve, reject) => {
      const { timeoutMs } = options;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = (): void => {
        off();
        if (timer !== undefined) clearTimeout(timer);
      };
      const off = this.on(event, (payload) => {
        cleanup();
        resolve(payload);
      });
      if (timeoutMs !== undefined) timer = setTimeout(() => {
        cleanup();
        reject(new TimeoutError(String(event), timeoutMs));
      }, timeoutMs);
    });
  }

}
