// ── Hashing ─────────────────────────────────────────────────────────────────
export { computeActionId } from './action-hash';
export type { ClientCompileOptions, ClientCompileResult } from './compile-client';
// ── High-level compile functions ────────────────────────────────────────────
export { compileClientModule } from './compile-client';
export type { ServerCompileOptions, ServerCompileResult } from './compile-server';
export { compileServerEntry } from './compile-server';
// ── Manifest generation (brika build) ─────────────────────────────────────────
export {
  type GeneratedBlock,
  type GeneratedBrick,
  type GeneratedManifest,
  type GeneratedPage,
  type GeneratedSpark,
  generateEntry,
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
