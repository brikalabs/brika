import { execSync } from 'node:child_process';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { build as esbuild } from 'esbuild';
import { defineConfig, type Plugin } from 'vite';

/**
 * Build-time identifier baked into the bootstrap SPA AND the service worker
 * so the SW Cache name (`brika-assets-${BUILD_ID}`) auto-rotates on every
 * deploy. Old caches are wiped by the SW's `activate` handler — no manual
 * cache-version bump in two files anymore.
 *
 * Falls back to a UTC timestamp when git isn't available (tarball builds,
 * non-repo CI). The fallback still rotates per build; it just isn't tied
 * to a reviewable commit.
 */
function buildId(): string {
  try {
    return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return `nogit-${Math.floor(Date.now() / 1000).toString(36)}`;
  }
}
const BUILD_ID = buildId();
const BUILD_ID_DEFINE = { __BRIKA_BUILD_ID__: JSON.stringify(BUILD_ID) };

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
 * Compile `sw/sw.ts` into `public/sw.js` so the browser receives plain JS at
 * `/sw.js` while we keep the SW source TypeScript-typed (`lib: "WebWorker"`).
 * Vite serves files from `public/` as-is in dev and copies them into the build
 * output, so emitting there is the simplest path — no rollup input wiring, no
 * extra dev middleware.
 */
function brikaSwPlugin(): Plugin {
  const entry = new URL('./sw/sw.ts', import.meta.url).pathname;
  const outfile = new URL('./public/sw.js', import.meta.url).pathname;

  const compile = async (): Promise<void> => {
    try {
      await esbuild({
        entryPoints: [entry],
        outfile,
        bundle: true,
        format: 'iife',
        target: 'es2022',
        platform: 'browser',
        logLevel: 'silent',
        define: BUILD_ID_DEFINE,
      });
    } catch (err) {
      console.error('[brika-sw] build failed', err);
    }
  };

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
  define: BUILD_ID_DEFINE,
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
