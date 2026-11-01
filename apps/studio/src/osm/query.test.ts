import { describe, expect, it } from 'vitest';
import { buildQuery } from './query.ts';

describe('buildQuery', () => {
  const query = buildQuery([-96.1, 36.0, -95.8, 36.3]);

  it('asks for JSON with geometry', () => {
    expect(query.startsWith('[out:json]')).toBe(true);
    expect(query.endsWith('out geom;')).toBe(true);
  });

  it('uses Overpass order for the box: south, west, north, east', () => {
    expect(query).toContain('(36,-96.1,36.3,-95.8)');
  });

  it('covers water, coastline, motorways and parks', () => {
    expect(query).toContain('["natural"="water"]');
    expect(query).toContain('["natural"="coastline"]');
    expect(query).toContain('["highway"~"^(motorway|trunk)$"]');
    expect(query).toContain('["leisure"="park"]');
    expect(query).toContain('["waterway"~"^(river|canal)$"]');
  });

  it('does not ask for streams, drains or ditches', () => {
    expect(query).not.toMatch(/stream|drain|ditch/);
  });
});
