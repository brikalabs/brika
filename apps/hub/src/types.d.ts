/**
 * Public type surface for `@brika/hub`.
 *
 * The hub is checked with its own (less strict) tsconfig — see
 * `apps/hub/tsconfig.check.json`. Consumers like `@brika/console`
 * shouldn't transitively re-check the hub's internals under their
 * stricter rules, so the package's `exports.types` points here
 * instead of `main.ts`. Bun's bundler still picks up the real source
 * via `exports.default`.
 */
export declare function startHub(): Promise<void>;
