/**
 * Augmentable namespace registry. A code-gen step (typically
 * `@brika/i18n-devtools`) widens the `BrikaI18n.Namespaces` global interface
 * to map each namespace name to its key tree:
 *
 *   declare global {
 *     namespace BrikaI18n {
 *       interface Namespaces {
 *         common: { hello: string; nav: { home: string } };
 *       }
 *     }
 *   }
 *
 * `KnownKey` then resolves to `'common:hello' | 'common:nav'` so the typed
 * `t()` overloads catch unknown keys at compile time.
 *
 * **Why global instead of module-scoped augmentation?** The previous design
 * used `declare module '@brika/i18n/registry' { interface Namespaces {} }`,
 * which only merges when the augmenting file can resolve the target module
 * specifier. Files generated into `node_modules/.cache/` can't walk up to
 * `node_modules/@brika/i18n` and the augmentation silently fails. A global
 * namespace dodges module resolution entirely — any `.d.ts` in the
 * compilation graph, anywhere on disk, merges into the same interface.
 */
declare global {
  // biome-ignore lint/style/noNamespace: required form for global merged-interface augmentation
  namespace BrikaI18n {
    interface Namespaces {}
  }
}

// Re-exported as a module type for callers that prefer to import it rather
// than reach into the global namespace.
export type Namespaces = BrikaI18n.Namespaces;

// Top-level keys of a namespace's key tree. Deeper paths intentionally
// collapse to `string` for now; full nested-path typing follows once consumers
// opt in.
type TopKeys<T> = T extends Record<string, unknown> ? keyof T & string : never;

export type KnownKey = {
  [N in keyof BrikaI18n.Namespaces]: `${N & string}:${TopKeys<BrikaI18n.Namespaces[N]>}`;
}[keyof BrikaI18n.Namespaces];
