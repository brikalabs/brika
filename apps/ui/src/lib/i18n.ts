/**
 * i18n Configuration
 *
 * Initializes i18next with a bulk backend that loads ALL translations
 * (core + plugin namespaces) in a single HTTP request at startup.
 *
 * Missing-namespace detection: when t() is called with a namespace that's
 * not in our cache (e.g. a newly installed plugin), a debounced refetch is
 * triggered. If the namespace is still absent after the refetch it is marked
 * as known-missing to prevent infinite reload loops.
 */

import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

// ─────────────────────────────────────────────────────────────────────────────
// Bulk Backend — loads ALL namespaces in one request
// ─────────────────────────────────────────────────────────────────────────────

type ReadCallback = (err: unknown, data: Record<string, unknown> | boolean) => void;
type AllNamespaces = Record<string, Record<string, unknown>>;

const cache = new Map<string, AllNamespaces>();
const inflight = new Map<string, Promise<AllNamespaces>>();

/** "lang:ns" keys confirmed absent after a refetch — prevents infinite loops */
const knownMissing = new Set<string>();

/** Namespaces queued for the next debounced refetch */
const pendingNs = new Set<string>();
let reloadTimer: ReturnType<typeof setTimeout> | undefined;

function fetchAll(language: string): Promise<AllNamespaces> {
  const cached = cache.get(language);
  if (cached) return Promise.resolve(cached);

  let pending = inflight.get(language);
  if (!pending) {
    pending = fetch(`/api/i18n/bundle/${language}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load translations: ${res.status}`);
        const data = (await res.json()) as AllNamespaces;

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

/** Invalidate cache for a language and refetch. */
function refetch(language: string): Promise<AllNamespaces> {
  cache.delete(language);
  return fetchAll(language);
}

/**
 * Called by missingKeyHandler when t() uses a namespace not in our cache.
 * Debounces so multiple missing keys in the same tick trigger only one refetch.
 */
function scheduleMissingNsReload(ns: string) {
  const lng = i18n.language;
  if (cache.get(lng)?.[ns] || knownMissing.has(`${lng}:${ns}`)) return;

  pendingNs.add(ns);
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(async () => {
    const missed = [...pendingNs];
    pendingNs.clear();
    const data = await refetch(lng);
    for (const missedNs of missed) {
      if (!data[missedNs]) knownMissing.add(`${lng}:${missedNs}`);
    }
  }, 300);
}

const BulkBackend = {
  type: 'backend' as const,
  init() {},
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
    fallbackLng: 'en',
    load: 'currentOnly',

    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
      convertDetectedLanguage: (lng: string) => lng.split('-')[0],
    },

    react: { useSuspense: true },
    interpolation: { escapeValue: false },
    debug: import.meta.env.DEV,

    // Detect missing namespaces: when t() is called with a namespace not in
    // our cache, schedule a refetch to pick up newly-loaded plugin translations.
    saveMissing: true,
    missingKeyHandler: (_lngs, ns, _key, _fallbackValue) => {
      scheduleMissingNsReload(ns);
    },
  });

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Force-reload all translations for the current language.
 * Clears the known-missing set so previously absent namespaces are retried.
 */
export async function reloadTranslations(): Promise<void> {
  knownMissing.clear();
  pendingNs.clear();
  clearTimeout(reloadTimer);
  await refetch(i18n.language);
}

export default i18n;
