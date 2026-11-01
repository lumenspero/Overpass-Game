import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from './debounce.ts';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('merges calls made within the delay into one run', () => {
    const run = vi.fn();
    const d = debounce(1000, run);
    d.schedule();
    vi.advanceTimersByTime(600);
    d.schedule();
    vi.advanceTimersByTime(999);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('flush runs a waiting run now, and only once', () => {
    const run = vi.fn();
    const d = debounce(1000, run);
    d.flush();
    expect(run).not.toHaveBeenCalled();
    d.schedule();
    d.flush();
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('cancel drops a waiting run', () => {
    const run = vi.fn();
    const d = debounce(1000, run);
    d.schedule();
    d.cancel();
    vi.advanceTimersByTime(2000);
    expect(run).not.toHaveBeenCalled();
  });
});
