// ── Hashing ─────────────────────────────────────────────────────────────────
export { computeActionId } from './action-hash';
export { hashPluginSources } from './hash-sources';

// ── Bun.build plugins ───────────────────────────────────────────────────────
export { brikaExternalsPlugin } from './plugins/externals';
export { brikaActionsPlugin } from './plugins/actions-client';
export { brikaServerActionsPlugin } from './plugins/actions-server';

// ── High-level compile functions ────────────────────────────────────────────
export { compileClientModule } from './compile-client';
export type { ClientCompileOptions, ClientCompileResult } from './compile-client';
export { compileServerEntry } from './compile-server';
export type { ServerCompileOptions, ServerCompileResult } from './compile-server';

// ── Build-time validation ───────────────────────────────────────────────────
export { validatePlugin } from './validate';
export type { ValidationDiagnostic, ValidationResult } from './validate';
