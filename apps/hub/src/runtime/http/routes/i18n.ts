import { route } from '@elia/router';
import { z } from 'zod';
import { I18nService } from '@/runtime/i18n';

export const i18nRoutes = [
  /**
   * GET /api/i18n/locales
   * Returns list of available locales
   */
  route.get('/api/i18n/locales', ({ inject }) => {
    const i18n = inject(I18nService);
    return { locales: i18n.listLocales() };
  }),

  /**
   * GET /api/i18n/namespaces
   * Returns list of all available namespaces (core + plugins)
   */
  route.get('/api/i18n/namespaces', ({ inject }) => {
    const i18n = inject(I18nService);
    return { namespaces: i18n.listNamespaces() };
  }),

  /**
   * GET /api/i18n/:locale/:namespace
   * Returns translations for a specific namespace.
   * Plugin namespaces use URL encoding for special characters.
   *
   * Examples:
   * - /api/i18n/en/common → core "common" namespace
   * - /api/i18n/fr/plugin:@elia/plugin-timer → plugin namespace (slash in @elia/plugin-timer is part of namespace)
   */
  route.get(
    '/api/i18n/:locale/:namespace{.+}',
    { params: z.object({ locale: z.string(), namespace: z.string() }) },
    ({ inject, params }) => {
      const i18n = inject(I18nService);
      const locale = params.locale || 'en';
      const namespace = params.namespace;

      if (!namespace) {
        return new Response('Namespace required', { status: 400 });
      }

      const translations = i18n.getNamespaceTranslations(locale, namespace);
      return translations ?? {};
    }
  ),
];
