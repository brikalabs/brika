// ── Bundler (Bun.build backend; the isolate backend ships as `@brika/compiler/v8`) ─
// Only BunBundler is consumed via the main entry (the hub); the isolate port,
// gate, report and stamp helpers are exposed through the ./bun and ./v8 routes.
export { BunBundler } from './bundle';
// ── Action analysis (one detector + one hasher, shared with the gate) ───────
export { actionExports, computeActionId } from './bundle/action-scan';
// ── Static i18n usage analysis (edge-safe, shared with the gate) ────────────
export {
  analyzeI18nUsage,
  type I18nUsageDiagnostics,
  type PluginI18nUsage,
  scanI18nUsage,
} from './bundle/i18n-usage';
// ── Action manifest entries (shared with the ./bun and ./v8 gate report) ────
export type { ActionEntry } from './bundle/report';
// ── Bundle port types (one shape for both backends and the raw pipelines) ───
export {
  type Backend,
  type BundleChunk,
  type BundleEntry,
  type BundleOptions,
  type BundleResult,
  type Bundler,
  CHUNK_PREFIX,
  type RawBundleResult,
} from './bundle/types';
export type {
  ClientBundleOptions,
  ClientCompileOptions,
  ClientCompileResult,
} from './compile-client';
// ── High-level compile functions ────────────────────────────────────────────
export { compileClientBundle, compileClientModule } from './compile-client';
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
// ── Source discovery (brika build / verify) ─────────────────────────────────
export { sourceFiles } from './scan';
export type { ValidationDiagnostic, ValidationResult } from './validate';
// ── Build-time validation ───────────────────────────────────────────────────
export { validatePlugin } from './validate';
