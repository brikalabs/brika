/**
 * Plug-and-play Vite config: drop this into a fresh React + Vite project and
 * `bun dev` will mount the i18n overlay automatically.
 *
 * No CSS imports, no provider wrappers, no Tailwind plugin tweaks — the
 * overlay lives in a Shadow DOM and brings its own styles.
 *
 * Expected locale layout (override via `localesDir`):
 *
 *   src/locales/
 *     en/
 *       common.json
 *     fr/
 *       common.json
 */

import { i18nDevtools } from '@brika/i18n-devtools/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    i18nDevtools({
      // Filesystem-only setup: just point at the locale folder. No server
      // required — the overlay validates against the local files directly.
      localesDir: './src/locales',
      // Optional: change the display-language hint shown in the overlay's
      // diff view. Validation itself is symmetric across all locales — no
      // locale is privileged as ground truth.
      // referenceLocale: 'en',
      //
      // Optional: pin a namespace prefix on a sub-tree of source files so
      // bare `t('key')` calls inside it resolve correctly.
      // sources: [
      //   { dir: './src' },
      //   { dir: './packages/checkout/src', namespace: 'checkout' },
      // ],
      //
      // Optional: union local files with a running server's bundles. Useful
      // when some translations are CMS-backed or come from runtime-installed
      // plugins the filesystem walk can't see.
      // remote: 'http://localhost:3001',
    }),
  ],
});
