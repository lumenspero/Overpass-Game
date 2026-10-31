import { describe, expect, it } from 'vitest';
import { nominatimUserAgent } from './nominatim-proxy.ts';

describe('nominatimUserAgent', () => {
  it('names the app and the contact', () => {
    expect(nominatimUserAgent('me@example.org')).toBe(
      'Overpass_Game-Studio/0.0.0 (me@example.org)',
    );
  });

  it('accepts a URL as the contact', () => {
    expect(nominatimUserAgent('https://example.org/contact')).toBe(
      'Overpass_Game-Studio/0.0.0 (https://example.org/contact)',
    );
  });

  it('trims surrounding whitespace', () => {
    expect(nominatimUserAgent('  me@example.org \n')).toBe(
      'Overpass_Game-Studio/0.0.0 (me@example.org)',
    );
  });

  it('refuses a missing, empty or unusable contact', () => {
    expect(nominatimUserAgent(undefined)).toBeNull();
    expect(nominatimUserAgent('')).toBeNull();
    expect(nominatimUserAgent('   ')).toBeNull();
    expect(nominatimUserAgent('not a contact')).toBeNull();
  });
});
