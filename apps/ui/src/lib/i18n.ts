/**
 * i18n Configuration
 *
 * Initializes i18next with HTTP backend to load translations from the Hub API.
 * Uses namespace-based loading for cacheability and dynamic plugin translation loading.
 *
 * Namespaces:
 * - Core: "common", "nav", "plugins", "dashboard", etc.
 * - Plugins: "plugin:@elia/plugin-timer", "plugin:@elia/blocks-builtin", etc.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import HttpBackend from "i18next-http-backend";

// ─────────────────────────────────────────────────────────────────────────────
// Initialize i18next
// ─────────────────────────────────────────────────────────────────────────────

i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    lng: "en",
    ns: "common",

    // Disable client-side fallback loading
    // The server already merges fallback translations in I18nService
    fallbackLng: false,
    load: "currentOnly",

    // HTTP Backend configuration
    backend: {
      // Load translations per namespace from Hub API
      // e.g., /api/i18n/en/common or /api/i18n/fr/plugin:@elia/plugin-timer
      loadPath: "/api/i18n/{{lng}}/{{ns}}",
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

export default i18n;
