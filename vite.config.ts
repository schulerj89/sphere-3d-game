import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs work both locally and from GitHub project Pages.
  base: './',
  build: {
    sourcemap: true,
  },
});
