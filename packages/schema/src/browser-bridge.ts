/**
 * Browser bridge contract: the single source of truth for the host modules
 * exposed to browser-compiled plugin modules (bricks, pages, block views) via
 * `globalThis.__brika.*`.
 *
 * - The compiler's externals plugin reads {@link BRIDGE_GLOBALS} to rewrite a
 *   plugin's `import … from '<specifier>'` into a reference to
 *   `globalThis.__brika.<prop>`, so the dependency is never bundled.
 * - The host UI populates exactly {@link BridgeProp} on `globalThis.__brika`
 *   before any brick loads, and types its bridge object against `BridgeProp`, so
 *   a registry entry it forgets to implement is a compile error.
 *
 * Adding a shared dependency is now a single edit here, kept honest by the type:
 * a new entry the UI doesn't provide fails the UI's typecheck.
 *
 * Lives in `@brika/schema` (the leaf package) so `@brika/compiler` reads the
 * map without depending on `@brika/sdk`; the SDK re-exports it unchanged as
 * `@brika/sdk/browser-bridge`. Distinct from the SDK's `./bridge`, which is the
 * IPC prelude contract for the plugin process (a different boundary entirely).
 */

/**
 * Import specifier → the `globalThis.__brika.<prop>` the host provides at
 * runtime. Several specifiers may share one prop (e.g. both react JSX runtimes
 * map to `jsx`; lucide-react and the SDK icons subpath both map to `icons`).
 */
export const BRIDGE_GLOBALS = {
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
} as const satisfies Record<string, string>;

/** A property the host must populate on `globalThis.__brika` for plugins to load. */
export type BridgeProp = (typeof BRIDGE_GLOBALS)[keyof typeof BRIDGE_GLOBALS];
