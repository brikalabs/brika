import { createI18n } from '@brika/i18n/react';

const i18n = createI18n({
  apiPrefix: '/api/i18n',
  defaultNamespace: 'common',
  // Namespaces consumed by RootLayout / route shell — pre-loaded at i18next
  // init so Suspense awaits them once and NavGroup / UserMenu / UpdateDialog
  // never render against an unloaded namespace.
  eagerNamespaces: ['nav', 'auth', 'settings'],
  fallbackLng: 'en',
  debug: import.meta.env.DEV,
});

export { reloadTranslations } from '@brika/i18n/react';
export default i18n;
