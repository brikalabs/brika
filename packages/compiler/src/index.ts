// ── Hashing ─────────────────────────────────────────────────────────────────
export { computeActionId } from './action-hash';
// ── Bundler (Bun.build backend; the isolate backend ships as `@brika/compiler/v8`) ─
// Only BunBundler is consumed via the main entry (the hub); the isolate port,
// gate, report and stamp helpers are exposed through the ./bun and ./v8 routes.
export { BunBundler } from './bundle';
export type {
  ClientBundleChunk,
  ClientBundleEntry,
  ClientBundleOptions,
  ClientBundleResult,
  ClientCompileOptions,
  ClientCompileResult,
} from './compile-client';
// ── High-level compile functions ────────────────────────────────────────────
export { CLIENT_CHUNK_PREFIX, compileClientBundle, compileClientModule } from './compile-client';
export type { ServerCompileOptions, ServerCompileResult } from './compile-server';
export { compileServerEntry } from './compile-server';
// ── Manifest generation (brika build) ─────────────────────────────────────────
export { generateEntry } from './generate-entry';
export {
  type GeneratedBlock,
  type GeneratedBrick,
  type GeneratedManifest,
  type GeneratedPage,
  type GeneratedSpark,
  generateManifest,
} from './generate-manifest';
export { hashPluginSources } from './hash-sources';
export { brikaActionsPlugin } from './plugins/actions-client';
export { brikaServerActionsPlugin } from './plugins/actions-server';
// ── Bun.build plugins ───────────────────────────────────────────────────────
export { brikaExternalsPlugin, browserAllowedSpecifiers } from './plugins/externals';
export type { ValidationDiagnostic, ValidationResult } from './validate';
// ── Build-time validation ───────────────────────────────────────────────────
export { validatePlugin } from './validate';
