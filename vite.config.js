import { defineConfig } from 'vite';

// Dev server stays at /. Production is a GitHub Pages project site: /CoralCutter/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/CoralCutter/' : '/',
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
}));
