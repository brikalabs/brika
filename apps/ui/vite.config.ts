import { i18nDevtools } from '@brika/i18n-devtools/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { bannerPlugin } from './vite-plugin-banner';
import { chunkSplitPlugin } from './vite-plugin-chunk-split';
import { hubProxy } from './vite-plugin-hub-proxy';
import { discoverBrikaI18nSources, findBrikaWorkspaceRoot } from './vite-i18n-brika-sources';

const HUB_ORIGIN = 'http://127.0.0.1:3001';

export default defineConfig(async () => {
  const viteRoot = new URL('.', import.meta.url).pathname;
  const workspaceRoot = (await findBrikaWorkspaceRoot(viteRoot)) ?? viteRoot;
  const pluginSources = await discoverBrikaI18nSources(workspaceRoot);

  return {
    plugins: [
      bannerPlugin(),
      chunkSplitPlugin(),
      hubProxy(HUB_ORIGIN),
      i18nDevtools({
        hub: HUB_ORIGIN,
        // Brika-side discovery: each workspace plugin / package becomes a
        // `SourceConfig` with the right namespace so the dev tool's overlay
        // resolves bare `t('key')` calls inside plugin code correctly.
        sources: [
          { dir: `${viteRoot}/src` },
          ...pluginSources.map((s) => ({ dir: s.dir, namespace: s.namespace })),
        ],
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
    },
  };
});
