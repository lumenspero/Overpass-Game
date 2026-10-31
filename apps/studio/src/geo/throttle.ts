/**
 * Serialises calls so each one starts at least `minIntervalMs` after the
 * previous one started. The clock and wait are injectable for tests.
 */
export function createThrottle(
  minIntervalMs: number,
  clock: () => number = () => Date.now(),
  wait: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): <T>(task: () => Promise<T>) => Promise<T> {
  let queue: Promise<unknown> = Promise.resolve();
  let lastStart = Number.NEGATIVE_INFINITY;

  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = async (): Promise<T> => {
      const delay = lastStart + minIntervalMs - clock();
      if (delay > 0) await wait(delay);
      lastStart = clock();
      return task();
    };
    const result = queue.then(run);
    queue = result.catch(() => undefined);
    return result;
  };
}
