import { describe, expect, test } from 'bun:test';
import {
  getPermissionTranslations,
  isPermissionLocale,
  PERMISSION_LIST,
  PERMISSION_TRANSLATION_LOCALES,
  PERMISSION_TRANSLATIONS,
} from '..';

describe('PERMISSION_TRANSLATIONS', () => {
  test('every supported locale has every permission with non-empty label/description', () => {
    for (const locale of PERMISSION_TRANSLATION_LOCALES) {
      const table = PERMISSION_TRANSLATIONS[locale];
      for (const def of PERMISSION_LIST) {
        const entry = table[def.id];
        expect(entry, `${locale}.${def.id} missing`).toBeDefined();
        expect(entry.label.length, `${locale}.${def.id}.label empty`).toBeGreaterThan(0);
        expect(entry.description.length, `${locale}.${def.id}.description empty`).toBeGreaterThan(0);
      }
    }
  });

  test('getPermissionTranslations returns the requested locale when known', () => {
    expect(getPermissionTranslations('fr')).toBe(PERMISSION_TRANSLATIONS.fr);
  });

  test('getPermissionTranslations falls back to English for unknown locales', () => {
    expect(getPermissionTranslations('xx')).toBe(PERMISSION_TRANSLATIONS.en);
    expect(getPermissionTranslations('')).toBe(PERMISSION_TRANSLATIONS.en);
  });

  test('isPermissionLocale narrows to supported locales', () => {
    expect(isPermissionLocale('en')).toBe(true);
    expect(isPermissionLocale('fr')).toBe(true);
    expect(isPermissionLocale('de')).toBe(false);
  });
});
