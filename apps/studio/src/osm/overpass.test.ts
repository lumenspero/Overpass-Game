import { describe, expect, it } from 'vitest';
import { loadOverpass, type KeyValueStore } from './overpass.ts';

function memoryStore(): KeyValueStore & { writes: number } {
  const data = new Map<string, unknown>();
  return {
    writes: 0,
    get: async (key) => data.get(key),
    set: async function (key, value) {
      this.writes++;
      data.set(key, value);
    },
  };
}

describe('loadOverpass', () => {
  const reply = { elements: [{ type: 'node', id: 1 }] };

  it('sends a query once and then serves it from the cache', async () => {
    const store = memoryStore();
    let sends = 0;
    const send = async () => {
      sends++;
      return reply;
    };

    const first = await loadOverpass('q1', store, send);
    const second = await loadOverpass('q1', store, send);

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.data).toEqual(reply);
    expect(sends).toBe(1);
    expect(first.hash).toBe(second.hash);
  });

  it('keys the cache by query text', async () => {
    const store = memoryStore();
    const a = await loadOverpass('query a', store, async () => reply);
    const b = await loadOverpass('query b', store, async () => reply);
    expect(a.hash).not.toBe(b.hash);
    expect(b.cached).toBe(false);
  });

  it('rejects a reply without elements and does not cache it', async () => {
    const store = memoryStore();
    await expect(
      loadOverpass('q', store, async () => ({ nope: true })),
    ).rejects.toThrow('unexpected reply');
    expect(store.writes).toBe(0);
  });
});
