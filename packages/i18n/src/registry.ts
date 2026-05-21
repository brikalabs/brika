/**
 * Augmentable namespace registry. Consumers (typically a code-gen step that
 * scans `*.json` translation files) widen this interface to map each namespace
 * name to its key tree:
 *
 *   declare module '@brika/i18n/registry' {
 *     interface Namespaces {
 *       common: { hello: string; nav: { home: string } };
 *     }
 *   }
 *
 * `KnownKey` then resolves to `'common:hello' | 'common:nav'` so the typed
 * `t()` overloads catch unknown keys at compile time.
 */
export interface Namespaces {}

// Top-level keys of a namespace's key tree. Deeper paths intentionally collapse
// to `string` for now; full nested-path typing follows once consumers opt in.
type TopKeys<T> = T extends Record<string, unknown> ? keyof T & string : never;

export type KnownKey = {
  [N in keyof Namespaces]: `${N & string}:${TopKeys<Namespaces[N]>}`;
}[keyof Namespaces];
