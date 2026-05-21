import type { Plugin } from 'vite';
import { type BannerOptions, createBanner } from './banner';

/**
 * Vite plugin that prints a `createBanner(opts)` block to stdout once when
 * the build starts. In watch / dev mode `buildStart` can fire multiple times
 * per process — the closure flag dedupes so the banner only prints on the
 * first invocation.
 *
 * Use from any `vite.config.ts`:
 *
 * ```ts
 * import { bannerPlugin } from '@brika/banner/vite';
 * import pkg from './package.json';
 *
 * export default defineConfig({
 *   plugins: [
 *     bannerPlugin({
 *       title: 'BRIKA',
 *       subtitle: 'Build. Run. Integrate. Keep Automating.',
 *       metadata: { Version: pkg.version, Package: pkg.name },
 *     }),
 *   ],
 * });
 * ```
 */
export function bannerPlugin(options: BannerOptions): Plugin {
  let shown = false;
  return {
    name: 'brika-banner',
    enforce: 'pre',
    buildStart() {
      if (shown) {
        return;
      }
      shown = true;
      console.log(createBanner(options));
    },
  };
}
