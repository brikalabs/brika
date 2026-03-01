import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { bannerPlugin } from './vite-plugin-banner';
import { chunkSplitPlugin } from './vite-plugin-chunk-split';

export default defineConfig({
  plugins: [
    bannerPlugin(),
    chunkSplitPlugin(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
});
