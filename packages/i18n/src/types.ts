export type TranslationData = Record<string, unknown>;

export type LocaleNamespaceMap = Record<string, TranslationData>;

export function isTranslationData(value: unknown): value is TranslationData {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
