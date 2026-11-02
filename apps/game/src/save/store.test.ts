import { describe, expect, it } from 'vitest';
import {
  fallbackStore,
  indexedStore,
  memoryStore,
  withTimeout,
  type RecordStore,
} from './store.ts';

describe('memory store', () => {
  it('returns a copy, so a changed value does not change the record', async () => {
    const store = memoryStore();
    await store.set('k', { n: 1 });
    const read = (await store.get('k')) as { n: number };
    read.n = 99;
    expect(await store.get('k')).toEqual({ n: 1 });
  });

  it('reads a missing key as undefined', async () => {
    await expect(memoryStore().get('missing')).resolves.toBeUndefined();
  });
});

describe('fallback store', () => {
  it('moves to memory on a failed read, and tells the caller once', async () => {
    const failing: RecordStore = {
      get: async () => {
        throw new Error('blocked');
      },
      set: async () => {
        throw new Error('blocked');
      },
    };
    const reasons: unknown[] = [];
    const store = fallbackStore(failing, (r) => reasons.push(r));
    await expect(store.get('x')).resolves.toBeUndefined();
    await store.set('x', 1);
    await expect(store.get('x')).resolves.toBe(1);
    expect(reasons).toHaveLength(1);
  });

  it('keeps a write in memory when the primary store refuses it', async () => {
    const mem = memoryStore();
    const flaky: RecordStore = {
      get: mem.get,
      set: async () => {
        throw new Error('quota');
      },
    };
    const reasons: unknown[] = [];
    const store = fallbackStore(flaky, (r) => reasons.push(r));
    await store.set('progress', { best: 3 });
    await expect(store.get('progress')).resolves.toEqual({ best: 3 });
    expect(reasons).toHaveLength(1);
  });
});

describe('withTimeout', () => {
  it('rejects when a store does not answer in time', async () => {
    await expect(withTimeout(new Promise(() => undefined), 10)).rejects.toThrow(
      /did not answer in time/,
    );
  });

  it('passes through an answer that comes in time', async () => {
    await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7);
  });
});

describe('indexed store', () => {
  it('cannot open where IndexedDB is missing', () => {
    expect(() => indexedStore()).toThrow(/IndexedDB is not available/);
  });
});
