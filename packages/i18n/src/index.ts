// Isomorphic entry — safe to import from browser, Node, or Bun.
// Node/Bun-only loaders, watchers, and workspace discovery live in `@brika/i18n/node`.

export { buildFallbackChain } from './fallback';
export {
  flatten,
  getNestedValue,
  isUnsafeKeySegment,
  sanitizeTranslationTree,
  setNestedValue,
  UNSAFE_SEGMENTS,
  UnsafeKeyPathError,
} from './key-path';
export { countLeafKeys } from './merge';
export { type KnownKey, type Namespaces } from './registry';
export { translate } from './translate';
export {
  type RegistryChange,
  type RegistryChangeListener,
  TranslationRegistry,
} from './translation-registry';
export { isTranslationData, type TranslationData } from './types';
