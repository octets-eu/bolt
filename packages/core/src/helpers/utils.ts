import { AbortedError } from '../errors';

/** Resolve after `ms`; reject with AbortedError as soon as `signal` aborts. */
export function wait (ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortedError('wait'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort (): void {
      clearTimeout(timer);
      reject(new AbortedError('wait'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** range(n) => 0..n-1, range(a, b) => a..b-1, range(a, b, step) */
export function range (start: number, end?: number, step = 1): number[] {
  if (end === undefined) {
    end = start;
    start = 0;
  }
  const result: number[] = [];
  for (let i = start; i < end; i += step) result.push(i);
  return result;
}

export function clamp (value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** One signal that aborts when any of the given ones does. Undefined entries are ignored. */
export function anySignal (...signals: (AbortSignal | undefined)[]): AbortSignal | undefined {
  const list = signals.filter((s): s is AbortSignal => s !== undefined);
  if (list.length === 0) return undefined;
  if (list.length === 1) return list[0];
  const controller = new AbortController();
  for (const s of list) {
    if (s.aborted) {
      controller.abort();
      break;
    }
    s.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}
