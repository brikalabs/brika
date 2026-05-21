// Isomorphic entry — safe to import from browser, Node, or Bun.
// Node/Bun-only loaders, watchers, and workspace discovery live in `@brika/i18n/node`.

export { buildFallbackChain } from './fallback';
export {
  defaultFormatters,
  type Formatter,
  type FormatterMap,
  type InterpolateOptions,
  interpolate,
} from './interpolate';
export {
  flatten,
  flattenInto,
  getNestedValue,
  setNestedValue,
  UnsafeKeyPathError,
  walkLeaves,
} from './key-path';
export { countLeafKeys, deepMerge, mergeFallbackChain } from './merge';
export {
  type PluralCategory,
  pluralCategories,
  selectPlural,
  selectPluralSuffix,
} from './plural';
export { type KnownKey, type Namespaces } from './registry';
export {
  type MissingKeyHandler,
  type ParsedKey,
  parseKey,
  type TranslateOptions,
  translate,
} from './translate';
export {
  type RegistryChange,
  type RegistryChangeKind,
  type RegistryChangeListener,
  type RegistryConfig,
  type RegistrySnapshot,
  type RegistryStats,
  type SetOptions,
  type SnapshotNamespace,
  TranslationRegistry,
} from './translation-registry';
export { isTranslationData, type LocaleNamespaceMap, type TranslationData } from './types';
