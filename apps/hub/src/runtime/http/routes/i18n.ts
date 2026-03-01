import { BadRequest, NotFound, route } from '@brika/router';
import { z } from 'zod';
import { I18nService } from '@/runtime/i18n';

export const i18nRoutes = [
  /**
   * GET /api/i18n/locales
   * Returns list of available locales
   */
  route.get({
    path: '/api/i18n/locales',
    handler: ({ inject }) => {
      const i18n = inject(I18nService);
      return {
        locales: i18n.listLocales(),
      };
    },
  }),

  /**
   * GET /api/i18n/namespaces
   * Returns list of all available namespaces (core + plugins)
   */
  route.get({
    path: '/api/i18n/namespaces',
    handler: ({ inject }) => {
      const i18n = inject(I18nService);
      return {
        namespaces: i18n.listNamespaces(),
      };
    },
  }),

  /**
   * GET /api/i18n/bundle/:locale
   * Returns ALL namespaces for a locale in a single response.
   * Used by the UI for bulk-loading translations at startup.
   * Also updates all running plugins with the new locale's translations.
   */
  route.get({
    path: '/api/i18n/bundle/:locale',
    params: z.object({
      locale: z.string(),
    }),
    handler: ({ inject, params }) => {
      const i18n = inject(I18nService);
      const locale = params.locale || 'en';
      return i18n.getAllTranslations(locale);
    },
  }),

  /**
   * GET /api/i18n/:locale/:namespace
   * Returns translations for a specific namespace.
   * Plugin namespaces use URL encoding for special characters.
   *
   * Examples:
   * - /api/i18n/en/common → core "common" namespace
   * - /api/i18n/fr/plugin:@brika/plugin-timer → plugin namespace (slash in @brika/plugin-timer is part of namespace)
   */
  route.get({
    path: '/api/i18n/:locale/:namespace{.+}',
    params: z.object({
      locale: z.string(),
      namespace: z.string(),
    }),
    handler: ({ inject, params }) => {
      const i18n = inject(I18nService);
      const locale = params.locale || 'en';
      const namespace = params.namespace;

      if (!namespace) {
        throw new BadRequest('Namespace required');
      }

      const translations = i18n.getNamespaceTranslations(locale, namespace);
      if (!translations) {
        throw new NotFound(`Namespace not found: ${namespace}`);
      }
      return translations;
    },
  }),
];
