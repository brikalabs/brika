/**
 * Minimal React + Vite plug-and-play setup with @brika/i18n.
 *
 * Files involved (kept in one file here for the example):
 *
 *   src/i18n.ts   — boot i18next + register the registry
 *   src/main.tsx  — render the provider
 *   src/App.tsx   — consume `useTranslate`
 *
 * Drop the three sections into your project as-is; they don't depend on
 * anything brika-specific.
 */

import { createI18n, switchLanguage, useIntl, useTranslate } from '@brika/i18n/react';
import i18next from 'i18next';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';

// ─── src/i18n.ts ─────────────────────────────────────────────────────────────

await createI18n({
  defaultLocale: 'en',
  fallbackLocale: 'en',
  defaultNamespace: 'common',
  // Point this at whatever serves `{ [namespace]: data }` for a given locale —
  // your own API, a static folder, anything.
  loadBundle: async (locale) => {
    const res = await fetch(`/api/i18n/bundle/${locale}`);
    if (!res.ok) {
      throw new Error(`Failed to load locale ${locale}: ${res.status}`);
    }
    return res.json();
  },
});

// ─── src/App.tsx ─────────────────────────────────────────────────────────────

function App() {
  const { t, locale } = useTranslate();
  const { formatNumber } = useIntl();

  return (
    <main>
      <h1>{t('common:greeting', { name: 'world' })}</h1>
      <p>{t('common:counter', { count: formatNumber(1_234) })}</p>
      <nav>
        <button onClick={() => void switchLanguage('en')} disabled={locale === 'en'}>
          EN
        </button>
        <button onClick={() => void switchLanguage('fr')} disabled={locale === 'fr'}>
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
