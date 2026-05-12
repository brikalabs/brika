import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Build config for the bootstrap shell. Outputs a small SPA into `dist/`,
 * which the signaling worker serves as its static asset binding.
 *
 * Keep dependencies minimal — every byte loads BEFORE the WebRTC handshake.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  build: {
    outDir: 'dist',
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
    // /v1/* (HTTP + WS) is proxied to a locally-running `wrangler dev`
    // so the bootstrap can mint tickets and open signaling against a real
    // coordinator while Vite serves the UI shell with HMR.
    proxy: {
      '/v1': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
