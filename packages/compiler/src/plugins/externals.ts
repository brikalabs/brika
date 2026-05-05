import type { BunPlugin } from 'bun';

/**
 * Import specifier → globalThis.__brika.* property name.
 * Adding a shared dependency = one line here + one line in plugin-bridge.ts (UI).
 */
const BRIDGE: Record<string, string> = {
  react: 'React',
  'react/jsx-runtime': 'jsx',
  'react/jsx-dev-runtime': 'jsx',
  '@brika/sdk/ui-kit': 'ui',
  '@brika/sdk/ui-kit/icons': 'icons',
  'lucide-react': 'icons',
  '@brika/sdk/ui-kit/hooks': 'hooks',
  '@brika/sdk/brick-views': 'brickHooks',
  clsx: 'clsx',
  'class-variance-authority': 'cva',
};

/** Escape a string for use as a literal inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * Filter regex matching only the bridged specifiers exactly.
 *
 * This must be exact: in Bun, returning `undefined` from an `onResolve`
 * callback whose filter matched still consumes the import and drops it
 * from the bundle (rather than falling through to default resolution).
 * Using a broad filter like /^[^./]/ silently breaks any unbridged
 * package import (e.g. `recharts`).
 */
const BRIDGE_FILTER = new RegExp(`^(?:${Object.keys(BRIDGE).map(escapeRegExp).join('|')})$`);

/** Replaces plugin imports with globalThis.__brika proxies at build time. */
export function brikaExternalsPlugin(): BunPlugin {
  return {
    name: 'brika-externals',
    setup(build) {
      build.onResolve({ filter: BRIDGE_FILTER }, (args) => ({
        path: args.path,
        namespace: 'brika-ext',
      }));
      build.onLoad({ namespace: 'brika-ext', filter: /.*/ }, (args) => ({
        contents: `module.exports=globalThis.__brika.${BRIDGE[args.path]};`,
        loader: 'js',
      }));
    },
  };
}
