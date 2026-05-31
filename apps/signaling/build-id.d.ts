/**
 * Build-time constant injected by `vite.config.ts` (Vite for the SPA, the
 * `brikaSwPlugin` esbuild call for the worker). Resolves to the short Git
 * SHA at build time so the SW Cache name (`brika-assets-${BUILD_ID}`)
 * auto-rotates per deploy — no manual cache-version bumps anywhere.
 *
 * NEVER read this lazily / via reflection: Vite/esbuild replace literal
 * usages during build, so the value is inlined into the bundle. Reading
 * via `globalThis.__BRIKA_BUILD_ID__` would resolve to `undefined`.
 */
declare const __BRIKA_BUILD_ID__: string;
