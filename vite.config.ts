import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';

function getBuildVersion(): string {
  const githubSha = process.env.GITHUB_SHA?.trim();
  if (githubSha) return githubSha.slice(0, 12);

  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim() || 'dev';
  } catch {
    return 'dev';
  }
}

const buildVersion = getBuildVersion().replace(/[^a-zA-Z0-9_-]/g, '');

export default defineConfig({
  // Relative asset URLs work both locally and from GitHub project Pages.
  base: './',
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-${buildVersion}-[hash].js`,
        chunkFileNames: `assets/[name]-${buildVersion}-[hash].js`,
        assetFileNames: (assetInfo) => assetInfo.name?.endsWith('.css')
          ? `assets/[name]-${buildVersion}-[hash][extname]`
          : 'assets/[name]-[hash][extname]',
      },
    },
  },
});
