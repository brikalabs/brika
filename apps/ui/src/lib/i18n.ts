/**
 * i18n Configuration
 *
 * Initializes i18next with a bulk backend that loads ALL translations
 * (core + plugin namespaces) in a single HTTP request at startup.
 *
 * Features:
 * - Single bulk fetch: `/api/i18n/bundle/{locale}` returns every namespace
 * - Language detection from localStorage, navigator, or fallback to 'en'
 * - CI-Mode support for displaying translation keys (debugging)
 * - `reloadTranslations()` for picking up new plugin translations at runtime
 */

import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

// ─────────────────────────────────────────────────────────────────────────────
// Bulk Backend — loads ALL namespaces in one request
// ─────────────────────────────────────────────────────────────────────────────

type ReadCallback = (err: unknown, data: Record<string, unknown> | boolean) => void;
type AllNamespaces = Record<string, Record<string, unknown>>;

/** Per-language cache of bulk-fetched translations */
const cache = new Map<string, AllNamespaces>();
const inflight = new Map<string, Promise<AllNamespaces>>();

function fetchAll(language: string): Promise<AllNamespaces> {
  const cached = cache.get(language);
  if (cached) return Promise.resolve(cached);

  let pending = inflight.get(language);
  if (!pending) {
    pending = fetch(`/api/i18n/bundle/${language}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load translations: ${res.status}`);
        const data = (await res.json()) as AllNamespaces;

        // Pre-add ALL namespaces to i18next so they're immediately available
        for (const [ns, translations] of Object.entries(data)) {
          i18n.addResourceBundle(language, ns, translations, true, true);
        }

        cache.set(language, data);
        inflight.delete(language);
        return data;
      })
      .catch((err) => {
        inflight.delete(language);
        throw err;
      });
    inflight.set(language, pending);
  }

  return pending;
}

const BulkBackend = {
  type: 'backend' as const,
  init() {
    // No backend initialization needed.
  },
  read(language: string, namespace: string, callback: ReadCallback) {
    if (language === 'cimode') {
      callback(null, {});
      return;
    }

    fetchAll(language)
      .then((all) => callback(null, all[namespace] ?? {}))
      .catch((err) => callback(err, false));
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Initialize i18next
// ─────────────────────────────────────────────────────────────────────────────

i18n
  .use(BulkBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    ns: 'common',

    // The server already merges fallback translations in I18nService
    fallbackLng: 'en',
    load: 'currentOnly',

    // Language detection configuration
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
      convertDetectedLanguage: (lng: string) => lng.split('-')[0],
    },

    // React settings
    react: {
      useSuspense: true,
    },

    // Interpolation settings
    interpolation: {
      escapeValue: false, // React already escapes
    },

    // Debug in development
    debug: import.meta.env.DEV,
  });

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reload all translations for the current language.
 * Call this when a new plugin is loaded at runtime to pick up its translations.
 */
export async function reloadTranslations(): Promise<void> {
  const lng = i18n.language;
  cache.delete(lng);

  const data = await fetchAll(lng);

  // addResourceBundle already called inside fetchAll,
  // but we also need to notify i18next that resources changed
  for (const [ns, translations] of Object.entries(data)) {
    i18n.addResourceBundle(lng, ns, translations, true, true);
  }
}

export default i18n;
