import { defineConfig } from 'vitest/config';

// Relative base so the built folder works from itch.io's zip upload
// and from any sub-path on Cloudflare.
export default defineConfig({
  base: './',
  test: {
    // Unit tests sit beside the code in src/. tests/ holds Playwright specs.
    include: ['src/**/*.test.ts'],
  },
});
