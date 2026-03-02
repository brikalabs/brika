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

/** All specifiers intercepted by the externals plugin. */
const ALL_EXTERNALS: ReadonlySet<string> = new Set(Object.keys(BRIDGE));

/** Replaces plugin imports with globalThis.__brika proxies at build time. */
export function brikaExternalsPlugin(): BunPlugin {
  return {
    name: 'brika-externals',
    setup(build) {
      // Bare specifiers (packages) never start with . or / — skip relative imports
      build.onResolve({ filter: /^[^./]/ }, (args) => {
        if (ALL_EXTERNALS.has(args.path)) {
          return { path: args.path, namespace: 'brika-ext' };
        }
      });
      build.onLoad({ namespace: 'brika-ext', filter: /.*/ }, (args) => ({
        contents: `module.exports=globalThis.__brika.${BRIDGE[args.path]};`,
        loader: 'js',
      }));
    },
  };
}
