/**
 * i18n Configuration
 *
 * Initializes i18next with HTTP backend to load translations from the Hub API.
 * Uses namespace-based loading for cacheability and dynamic plugin translation loading.
 *
 * Features:
 * - Language detection from localStorage, navigator, or fallback to 'en'
 * - CI-Mode support for displaying translation keys (debugging)
 * - Namespace-based lazy loading
 *
 * Namespaces:
 * - Core: "common", "nav", "plugins", "dashboard", etc.
 * - Plugins: "plugin:@brika/plugin-timer", "plugin:@brika/blocks-builtin", etc.
 */

import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend, { type HttpBackendOptions } from 'i18next-http-backend';
import { initReactI18next } from 'react-i18next';

// ─────────────────────────────────────────────────────────────────────────────
// Initialize i18next
// ─────────────────────────────────────────────────────────────────────────────

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    ns: 'common',

    // Disable client-side fallback loading
    // The server already merges fallback translations in I18nService
    fallbackLng: 'en',
    load: 'currentOnly',

    // Language detection configuration
    detection: {
      // Order of detection: localStorage first, then browser language
      order: ['localStorage', 'navigator'],
      // Cache the detected language in localStorage
      caches: ['localStorage'],
      // localStorage key
      lookupLocalStorage: 'i18nextLng',
    },

    // HTTP Backend configuration
    backend: {
      // Load translations per namespace from Hub API
      // e.g., /api/i18n/en/common or /api/i18n/fr/plugin:@brika/plugin-timer
      loadPath: '/api/i18n/{{lng}}/{{ns}}',

      // Don't load translations for CI-Mode - i18next handles it internally
      // by showing keys instead of values
      request: (options, url, payload, callback) => {
        // Extract language from URL
        const match = url.match(/\/api\/i18n\/([^/]+)\//);
        const lng = match?.[1];

        if (lng === 'cimode') {
          // Return empty translations for CI-Mode
          // i18next will display the keys as-is
          callback(null, { status: 200, data: {} });
          return;
        }

        // Default behavior: fetch from server
        fetch(url)
          .then((res) => res.json())
          .then((data) => callback(null, { status: 200, data }))
          .catch((err) => callback(err, { status: 500, data: {} }));
      },
    } satisfies HttpBackendOptions,

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

export default i18n;
