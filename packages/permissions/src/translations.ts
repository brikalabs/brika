import enRaw from '../locales/en.json' with { type: 'json' };
import frRaw from '../locales/fr.json' with { type: 'json' };
import { PERMISSIONS, type Permission } from './definitions';

export interface PermissionTranslation {
  readonly label: string;
  readonly description: string;
}

export type PermissionTranslations = Readonly<Record<Permission, PermissionTranslation>>;

/**
 * Compile-time check that the JSON files cover every Permission. The
 * `satisfies` clause errors at type-check time if a permission family is
 * added without translations.
 */
const EN: PermissionTranslations = enRaw satisfies PermissionTranslations;
const FR: PermissionTranslations = frRaw satisfies PermissionTranslations;

/**
 * Locale code → translations table. Adding a new permission family without
 * translations is a compile error (above). Adding a new locale means
 * importing its JSON file and adding it here.
 *
 * The hub `I18nService` merges these into the `plugins.permissions`
 * namespace at boot, so translations ship with the package rather than the
 * hub locale folder.
 */
export const PERMISSION_TRANSLATIONS = {
  en: EN,
  fr: FR,
} as const satisfies Record<string, PermissionTranslations>;

export type PermissionLocale = keyof typeof PERMISSION_TRANSLATIONS;

export const PERMISSION_TRANSLATION_LOCALES: ReadonlyArray<PermissionLocale> =
  Object.keys(PERMISSION_TRANSLATIONS).filter(isPermissionLocale);

export function isPermissionLocale(locale: string): locale is PermissionLocale {
  return Object.hasOwn(PERMISSION_TRANSLATIONS, locale);
}

export function getPermissionTranslations(locale: string): PermissionTranslations {
  return isPermissionLocale(locale) ? PERMISSION_TRANSLATIONS[locale] : PERMISSION_TRANSLATIONS.en;
}

/**
 * Permission ids in registry order. Used by tests to assert every entry has
 * translations in every locale.
 */
export function permissionIds(): ReadonlyArray<Permission> {
  return Object.keys(PERMISSIONS).filter(isPermission);
}

function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSIONS, value);
}
