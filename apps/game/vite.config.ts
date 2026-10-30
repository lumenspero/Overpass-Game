import { defineConfig } from 'vite';

// Relative base so the built folder works from itch.io's zip upload
// and from any sub-path on Cloudflare.
export default defineConfig({
  base: './',
});
