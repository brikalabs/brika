/**
 * `@brika/compiler/bun` - the plugin compiler built for the Bun runtime.
 * IDENTICAL api to `@brika/compiler/v8`; only the backend differs. Swap this
 * import for `/v8` to run the isolate compiler instead, with no other change.
 */
import { BunBundler } from './bun';
import { FINGERPRINT } from './route-shared';
import type { Bundler } from './types';

/**
 * A {@link Bundler} backed by `Bun.build` (needs the Bun runtime; bundles the
 * plugin's deps from disk). Same signature as the v8 route's `createCompiler`,
 * so `.bundle(opts)` is a drop-in swap.
 */
export function createCompiler(version: string = FINGERPRINT): Bundler {
  return new BunBundler(version);
}

// `compilePluginGate` is the portable rollup+sucrase gate (same on both routes),
// NOT Bun.build - it stamps `isolate@<fp>`. Use `createCompiler()` above for the
// Bun.build backend.
export * from './route-shared';
