import { spawn } from 'node:child_process';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * One dev server for both halves of the signaling package:
 *   - `client/` (React SPA) is served by Vite with HMR.
 *   - `server/worker.ts` runs inside miniflare (via @cloudflare/vite-plugin),
 *     so /v1/* + WebSocket upgrades hit the real Worker code — same DO + D1
 *     bindings the production deploy uses, just locally.
 *
 * `vite build` emits the SPA to `dist/client/` (matching the [assets].directory
 * in wrangler.toml) and the worker bundle to `dist/<worker-name>/`. From there
 * `wrangler deploy` ships a single Worker with the SPA attached as static
 * assets — no separate build step.
 *
 * Keep client deps minimal: every byte loads BEFORE the WebRTC handshake.
 */

/**
 * Compile `src/sw.ts` into `public/sw.js` so the browser receives plain JS at
 * `/sw.js` while we keep the SW source TypeScript-typed (`lib: "WebWorker"`).
 * Vite serves files from `public/` as-is in dev and copies them into the build
 * output, so emitting there is the simplest path — no rollup input wiring, no
 * extra dev middleware. Uses Bun's bundler (already in our toolchain).
 */
function brikaSwPlugin(): Plugin {
  const entry = new URL('./sw/sw.ts', import.meta.url).pathname;
  const outdir = new URL('./public', import.meta.url).pathname;

  const compile = (): Promise<void> =>
    new Promise<void>((resolve) => {
      // Shell out to `bun build` — Vite itself runs under Node here (the
      // `vite` shebang is `#!/usr/bin/env node`), so `Bun.build` isn't in
      // scope and Vite's bundled esbuild isn't exposed for direct import.
      // Bun is part of the toolchain so its CLI is always available.
      const proc = spawn(
        'bun',
        ['build', entry, '--outdir', outdir, '--target', 'browser', '--outfile', 'sw.js'],
        { stdio: ['ignore', 'ignore', 'inherit'] }
      );
      proc.on('exit', (code) => {
        if (code !== 0) {
          console.error(`[brika-sw] build exited with code ${code}`);
        }
        resolve();
      });
      proc.on('error', (err) => {
        console.error('[brika-sw] failed to spawn bun build', err);
        resolve();
      });
    });

  return {
    name: 'brika-sw',
    async configResolved() {
      await compile();
    },
    configureServer(server) {
      server.watcher.add(entry);
      server.watcher.on('change', (path) => {
        if (path === entry) {
          void compile();
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [brikaSwPlugin(), cloudflare(), react(), tailwindcss()],
  resolve: {
    alias: {
      // Bootstrap sources live under `src/_boot/` to namespace their public
      // URLs (`/src/_boot/router.tsx`, etc.) away from the hub UI's `/src/*`.
      // Without this isolation the two apps collide on shared filenames
      // (`router.tsx`, `App.tsx`, `index.css`) once both are mounted in the
      // same document: ES-module dedup serves whichever loaded first, and
      // the other app explodes with "module does not provide export X".
      '@': new URL('./src/_boot', import.meta.url).pathname,
    },
  },
  build: {
    sourcemap: false,
    target: 'es2022',
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  server: {
    port: 5174,
  },
});
