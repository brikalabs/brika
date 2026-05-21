/**
 * Minimal React + Vite plug-and-play setup with @brika/i18n.
 *
 * Files involved (kept in one file here for the example):
 *
 *   src/i18n.ts   — boot i18next + register the HTTP backend
 *   src/main.tsx  — render the provider
 *   src/App.tsx   — consume `useLocale`
 *
 * Drop the three sections into your project as-is; they don't depend on
 * anything brika-specific. The default HTTP backend expects:
 *
 *   GET  {apiPrefix}/:locale/:namespace      → { key: value }
 *   GET  {apiPrefix}/bundle/:locale          → { [namespace]: data }
 *   SSE  {apiPrefix}/events                  → { kind, namespace, locale? }
 */

import { createI18n, useLocale } from '@brika/i18n/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';

// ─── src/i18n.ts ─────────────────────────────────────────────────────────────

const i18next = createI18n({
  apiPrefix: '/api/i18n',
  defaultNamespace: 'common',
  // Namespaces awaited at i18next init so route shells never render against an
  // unloaded namespace. Per-page namespaces stay lazy via `useTranslation`.
  eagerNamespaces: ['nav'],
  fallbackLng: 'en',
});

// ─── src/App.tsx ─────────────────────────────────────────────────────────────

function App() {
  const { t, locale, changeLocale, formatNumber } = useLocale();

  return (
    <main>
      <h1>{t('common:greeting', { name: 'world' })}</h1>
      <p>{t('common:counter', { count: formatNumber(1_234) })}</p>
      <nav>
        <button onClick={() => void changeLocale('en')} disabled={locale === 'en'}>
          EN
        </button>
        <button onClick={() => void changeLocale('fr')} disabled={locale === 'fr'}>
          FR
        </button>
      </nav>
    </main>
  );
}

// ─── src/main.tsx ────────────────────────────────────────────────────────────

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <I18nextProvider i18n={i18next}>
        <App />
      </I18nextProvider>
    </StrictMode>
  );
}
