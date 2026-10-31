import { defineConfig } from 'vitest/config';

// Unit tests sit beside the code in src/ and dev/. tests/ holds Playwright specs.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'dev/**/*.test.ts'],
  },
});
