import { describe, expect, it } from 'vitest';
import { MAX_QUERY_BYTES, checkOverpassRequest } from './overpass-proxy.ts';

describe('checkOverpassRequest', () => {
  it('allows a POST to the interpreter endpoint', () => {
    expect(checkOverpassRequest('POST', '/api/interpreter', 120)).toBeNull();
  });

  it('refuses other methods', () => {
    expect(checkOverpassRequest('GET', '/api/interpreter', 0)?.status).toBe(
      405,
    );
  });

  it('refuses other endpoints', () => {
    expect(checkOverpassRequest('POST', '/api/status', 0)?.status).toBe(404);
  });

  it('refuses oversized queries', () => {
    expect(
      checkOverpassRequest('POST', '/api/interpreter', MAX_QUERY_BYTES + 1)
        ?.status,
    ).toBe(413);
  });
});
