import type { BunPlugin } from 'bun';

/**
 * Import specifier → globalThis.__brika.* property name.
 * Adding a shared dependency = one line here + one line in plugin-bridge.ts (UI).
 */
const BRIDGE: Record<string, string> = {
  react: 'React',
  'react/jsx-runtime': 'jsx',
  'react/jsx-dev-runtime': 'jsx',
  // Bare @brika/sdk in client code resolves to a small client-safe surface
  // (e.g. `capture`). Importing the full SDK into a browser bundle would pull
  // in zod + server-only deps and fail to build.
  '@brika/sdk': 'sdk',
  '@brika/sdk/ui-kit': 'ui',
  '@brika/sdk/ui-kit/icons': 'icons',
  'lucide-react': 'icons',
  '@brika/sdk/ui-kit/hooks': 'hooks',
  '@brika/sdk/brick-views': 'brickHooks',
  '@brika/sdk/block-views': 'blockHooks',
  clsx: 'clsx',
  'class-variance-authority': 'cva',
};

/**
 * @brika/sdk subpaths that a browser module may import directly even though they
 * are NOT bridged: they bundle as real, react-free code. `@brika/sdk/brick`
 * (the `defineBrick` descriptor) is imported by a single-file brick's view.
 */
const BROWSER_SAFE = ['@brika/sdk/brick'] as const;

/**
 * The exact set of import specifiers a browser-compiled plugin module (brick or
 * page) may use: everything the host bridges to globalThis.__brika.*, plus the
 * react-free browser-safe descriptor modules. Anything else under @brika/sdk is
 * server-only and importing it into a browser module is a boundary violation
 * (`brika check` scans for this). Single source of truth.
 */
export function browserAllowedSpecifiers(): ReadonlySet<string> {
  return new Set([...Object.keys(BRIDGE), ...BROWSER_SAFE]);
}

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
