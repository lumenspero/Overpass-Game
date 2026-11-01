export interface Debouncer {
  /** Runs `run` after the delay. Calls made before it fires are merged into one run. */
  schedule(): void;
  /** Runs `run` now if a run is waiting. */
  flush(): void;
  /** Drops a waiting run. */
  cancel(): void;
}

export function debounce(ms: number, run: () => void): Debouncer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return {
    schedule(): void {
      stop();
      timer = setTimeout(() => {
        timer = null;
        run();
      }, ms);
    },
    flush(): void {
      if (timer === null) return;
      stop();
      run();
    },
    cancel(): void {
      stop();
    },
  };
}
