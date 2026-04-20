// ── Hashing ─────────────────────────────────────────────────────────────────
export { computeActionId } from './action-hash';
export type { ClientCompileOptions, ClientCompileResult } from './compile-client';
// ── High-level compile functions ────────────────────────────────────────────
export { compileClientModule } from './compile-client';
export type { ServerCompileOptions, ServerCompileResult } from './compile-server';
export { compileServerEntry } from './compile-server';
export { hashPluginSources } from './hash-sources';
export { brikaActionsPlugin } from './plugins/actions-client';
export { brikaServerActionsPlugin } from './plugins/actions-server';
// ── Bun.build plugins ───────────────────────────────────────────────────────
export { brikaExternalsPlugin } from './plugins/externals';
export type { ValidationDiagnostic, ValidationResult } from './validate';
// ── Build-time validation ───────────────────────────────────────────────────
export { validatePlugin } from './validate';
