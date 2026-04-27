import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * In dev mode, rewrite `@brika/clay` and `@brika/clay/components/<name>` imports
 * to the raw source files in the sibling `packages/clay/src/` tree.
 *
 * This gives us instant HMR against live library source. The production build
 * uses the real `exports` map in `packages/clay/package.json`.
 *
 * Typed as a structural Vite plugin shape to avoid pinning to a specific Vite
 * major — Astro 5 bundles Vite 6 but the monorepo hoists Vite 7, and importing
 * the real `Plugin` type triggers a version-conflict diagnostic.
 */
export interface ClayHmrPluginOptions {
  readonly dev: boolean;
}

interface ClayHmrPlugin {
  readonly name: string;
  readonly enforce: 'pre';
  resolveId(source: string): string | null;
}

const CLAY_PACKAGE = '@brika/clay';
const CLAY_COMPONENT_PREFIX = '@brika/clay/components/';

export function clayHmrPlugin(options: ClayHmrPluginOptions): ClayHmrPlugin {
  const here = dirname(fileURLToPath(import.meta.url));
  const claySrc = resolve(here, '../../../../packages/clay/src');

  return {
    name: 'clay-hmr',
    enforce: 'pre',
    resolveId(source: string): string | null {
      if (!options.dev) {
        return null;
      }
      if (source === CLAY_PACKAGE) {
        const target = resolve(claySrc, 'index.ts');
        return existsSync(target) ? target : null;
      }
      if (source.startsWith(CLAY_COMPONENT_PREFIX)) {
        const name = source.slice(CLAY_COMPONENT_PREFIX.length);
        if (name.length === 0 || name.includes('/')) {
          return null;
        }
        const target = resolve(claySrc, 'components', name, 'index.ts');
        return existsSync(target) ? target : null;
      }
      return null;
    },
  };
}
