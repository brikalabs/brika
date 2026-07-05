/**
 * Everything the `@brika/compiler/bun` and `@brika/compiler/v8` routes export
 * IDENTICALLY: the portable gate, the stamp helpers, and the port types. Each
 * route module adds only its own `createCompiler` binding (BunBundler vs
 * IsolateBundler), so a new shared export is added here exactly once.
 */

/** Fingerprint baked by `build.ts` via `Bun.build` define; `dev` for un-built source. */
export const FINGERPRINT = process.env.BRIKA_GATE_VERSION ?? 'dev';

export type { ActionEntry, GateOptions, GateResult, PluginManifest, PluginReport } from './gate';
export { buildReport, compilePluginGate, readManifest, scanActions } from './gate';
export { readStamp, stamp } from './stamp';
export type {
  BundleChunk,
  BundleEntry,
  BundleOptions,
  BundleResult,
  Bundler,
} from './types';
export { CHUNK_PREFIX } from './types';
