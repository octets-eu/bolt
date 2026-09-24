/** Resolve after `ms`. */
export function wait (ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolve as soon as `signal` aborts, never reject: a step races its waits against it to end, not throw, on fullstop. */
export function whenAborted (signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) resolve();
    else signal.addEventListener('abort', () => resolve(), { once: true });
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
