import { i18nDevtools } from '@brika/i18n-devtools/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { bannerPlugin } from './vite-plugin-banner';
import { chunkSplitPlugin } from './vite-plugin-chunk-split';

export default defineConfig({
  plugins: [
    bannerPlugin(),
    chunkSplitPlugin(),
    i18nDevtools({
      localesDir: new URL('../hub/src/locales', import.meta.url).pathname,
    }),
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
