import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

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
export default defineConfig({
  plugins: [cloudflare(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
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
