import { bannerPlugin } from '@brika/banner/vite';
import { i18nDevtools } from '@brika/i18n-devtools/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import pkg from './package.json';
import { hubProxy } from './vite/hub-proxy';
import { brikaI18nSources } from './vite/i18n-sources';
import { manualChunks } from './vite/manual-chunks';

const HUB_ORIGIN = 'http://127.0.0.1:3001';

export default defineConfig(async () => ({
  plugins: [
    bannerPlugin({
      title: 'BRIKA',
      subtitle: 'Build. Run. Integrate. Keep Automating.',
      metadata: { Version: pkg.version, Package: pkg.name },
    }),
    hubProxy(HUB_ORIGIN),
    i18nDevtools({
      remote: HUB_ORIGIN,
      sources: await brikaI18nSources(import.meta.url),
      // Brika's `tp(pluginId, key)` host wrapper prepends `'plugin:'` to the
      // runtime namespace; the static scanner doesn't replicate that. Telling
      // the validator about the convention prevents every plugin-locale key
      // from being flagged as a false dead-key.
      tpNamespacePrefixes: ['plugin:'],
      // Hub's bundle includes `plugin:` namespaces from runtime-installed
      // plugins whose source isn't in the workspace — skip dead-key checks
      // for them to avoid hundreds of false positives.
      deadKeyIgnoreNamespaces: ['plugin:'],
    }),
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: { manualChunks },
    },
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  server: {
    port: 5173,
  },
}));
