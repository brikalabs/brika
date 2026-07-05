/**
 * `@brika/compiler/v8` - the plugin compiler built for a V8 isolate / Cloudflare
 * Worker. IDENTICAL api to `@brika/compiler/bun`; only the backend differs, so
 * a consumer (the hub included) can swap routes to run the isolate compiler
 * instead of Bun.build by changing this import path and nothing else.
 */
import { IsolateBundler } from './isolate';
import { FINGERPRINT } from './route-shared';
import type { Bundler } from './types';

/**
 * A {@link Bundler} backed by rollup + sucrase (pure JS; runs in any V8 isolate).
 * Same signature as the Bun route's `createCompiler`, so `.bundle(opts)` is a
 * drop-in swap.
 */
export function createCompiler(version: string = FINGERPRINT): Bundler {
  return new IsolateBundler(version);
}

export * from './route-shared';
