import { route } from "@elia/router";
import { I18nService } from "../../i18n";

export const i18nRoutes = [
  /**
   * GET /api/i18n/locales
   * Returns list of available locales
   */
  route.get("/api/i18n/locales", async ({ inject }) => {
    const i18n = inject(I18nService);
    return { locales: i18n.listLocales() };
  }),

  /**
   * GET /api/i18n/namespaces
   * Returns list of all available namespaces (core + plugins)
   */
  route.get("/api/i18n/namespaces", async ({ inject }) => {
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
  route.get("/api/i18n/:locale/:namespace", async ({ inject, params }) => {
    const i18n = inject(I18nService);
    const locale = params.locale || "en";
    const namespace = params.namespace;

    if (!namespace) {
      return new Response("Namespace required", { status: 400 });
    }

    const translations = i18n.getNamespaceTranslations(locale, namespace);
    if (!translations) {
      return new Response("Namespace not found", { status: 404 });
    }

    return translations;
  }),

  /**
   * GET /api/i18n/:locale/:ns1/:ns2
   * Handles plugin namespaces with slashes (e.g., plugin:@elia/plugin-timer)
   * Combines ns1/ns2 back into the full namespace.
   */
  route.get("/api/i18n/:locale/:ns1/:ns2", async ({ inject, params }) => {
    const i18n = inject(I18nService);
    const locale = params.locale || "en";
    const namespace = `${params.ns1}/${params.ns2}`;

    const translations = i18n.getNamespaceTranslations(locale, namespace);
    if (!translations) {
      return new Response("Namespace not found", { status: 404 });
    }

    return translations;
  }),
];
