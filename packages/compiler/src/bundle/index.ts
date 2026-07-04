/**
 * Bundler port with two adapters that produce equivalent accept/reject results:
 *   - `BunBundler`     native `Bun.build` (the hub) - this barrel
 *   - `IsolateBundler` rollup + sucrase, for a V8 isolate / Worker - imported
 *      only via `@brika/compiler/v8` (see `./gate`), so Bun consumers of
 *      the main entry never pull rollup/sucrase into their bundle.
 *
 * There is no runtime autodetect helper on purpose: the runtime is always known
 * at the composition root (the hub is Bun, the Worker gate is the isolate), so
 * each binds its adapter explicitly.
 */

export { BunBundler } from './bun';
export { readStamp, stamp } from './stamp';
export type {
  Backend,
  BundleChunk,
  BundleEntry,
  BundleOptions,
  BundleResult,
  Bundler,
} from './types';
