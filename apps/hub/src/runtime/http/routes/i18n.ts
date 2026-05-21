import { BadRequest, createSSEStream, NotFound, route } from '@brika/router';
import { z } from 'zod';
import { I18nService } from '@/runtime/i18n';
import { isUnsafeKeyPathError } from '@/runtime/i18n/i18n-key-safety';
import { Logger } from '@/runtime/logs/log-router';

/**
 * Body schema for `POST /api/i18n/sources/:namespace/:locale`.
 * Accepts a single dot-path edit; the hub reads the file, applies the edit,
 * writes back, and the watcher hot-reloads.
 *
 * Constraints:
 * - `key` is non-empty, max 256 chars, no leading/trailing whitespace.
 *   (Path-segment safety against prototype pollution is enforced inside
 *   `setNestedValue`; this schema only catches malformed inputs early.)
 * - `value` is a string. Translation leaves are strings; nested structures
 *   should be expressed as multiple keys.
 */
const editKeyBody = z.object({
  key: z.string().trim().min(1).max(256),
  value: z.string().max(10_000),
});

/**
 * Hard gate for the write surface. Even authenticated callers can't list or
 * edit source files unless the operator explicitly opts in by setting
 * `BRIKA_ALLOW_I18N_EDITS=1` in the hub's environment. Default off so that
 * shipped production binaries never expose file paths or accept file writes
 * over the API, regardless of who authenticates.
 *
 * Returns `NotFound` (not `Forbidden`) so the existence of the endpoint
 * isn't disclosed to clients with valid credentials but no edit privilege.
 */
function ensureI18nEditsEnabled(): void {
  if (Bun.env.BRIKA_ALLOW_I18N_EDITS !== '1') {
    throw new NotFound('I18n editing is disabled on this hub');
  }
}

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
   *
   * Serves a pre-stringified body cached on the registry with a content-hash
   * `ETag`. `If-None-Match` short-circuits to 304 so browsers can skip a 50KB+
   * payload on warm refreshes.
   */
  route.get({
    path: '/api/i18n/bundle/:locale',
    params: z.object({
      locale: z.string(),
    }),
    handler: ({ inject, params, req }) => {
      const i18n = inject(I18nService);
      const locale = params.locale || 'en';
      const { body, etag } = i18n.getBundleJson(locale);

      if (req.headers.get('if-none-match') === etag) {
        return new Response(null, {
          status: 304,
          headers: { ETag: etag, 'Cache-Control': 'no-cache' },
        });
      }
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ETag: etag,
          'Cache-Control': 'no-cache',
        },
      });
    },
  }),

  /**
   * GET /api/i18n/events
   * Server-Sent Events stream of registry mutations. The UI subscribes here
   * to learn about late-registered plugin namespaces, hub-side hot reloads,
   * and plugin unregisters — replacing the old missing-key debounced refetch.
   *
   * Event payloads mirror RegistryChange:
   *   { kind: 'set' | 'remove' | 'clear', namespace: string | null, locale?, source? }
   */
  route.get({
    path: '/api/i18n/events',
    handler: ({ inject }) => {
      const i18n = inject(I18nService);
      return createSSEStream((send) => {
        return i18n.onChange((change) => {
          send(change);
        });
      });
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

// ─── Admin-only write routes ─────────────────────────────────────────────────
//
// Anything that writes to translation files lives here so it sits behind
// both `requireAuth()` and `requireScope(Scope.ADMIN_ALL)` applied in
// `routes/index.ts`. Anonymous callers can read translations (the public
// group above); only admin sessions can list source files or edit them.

export const i18nWriteRoutes = [
  /**
   * GET /api/i18n/sources
   * Lists every on-disk source file the hub knows about — one entry per
   * (namespace, locale) pair, with the absolute path and the source kind.
   *
   * Safety layers:
   *   - Behind `requireAuth()` + `requireScope(Scope.ADMIN_ALL)`
   *     (see routes/index.ts) — low-privilege callers can't see
   *     filesystem paths.
   *   - Disabled unless `BRIKA_ALLOW_I18N_EDITS=1` is set on the hub.
   *     Production binaries default to off so paths never leak.
   */
  route.get({
    path: '/api/i18n/sources',
    handler: ({ inject }) => {
      ensureI18nEditsEnabled();
      const i18n = inject(I18nService);
      return { sources: i18n.listSourceFiles() };
    },
  }),

  /**
   * POST /api/i18n/sources/:namespace/:locale
   * Apply a `{ key, value }` edit to the file backing (namespace, locale).
   * The fs.watcher picks up the change and the registry hot-reloads.
   *
   * Safety layers:
   *   - Disabled unless `BRIKA_ALLOW_I18N_EDITS=1` is set on the hub.
   *   - Behind `requireAuth()` + `requireScope(Scope.ADMIN_ALL)` (see
   *     routes/index.ts) — only admin sessions can mutate translation
   *     files.
   *   - Only files the hub already loaded at boot are editable
   *     (`getSourceFile` lookup → no path traversal).
   *   - `setNestedValue` rejects `__proto__` / `constructor` / `prototype`
   *     segments to prevent prototype pollution.
   *   - Schema limits key (256 chars) and value (10KB string).
   *   - Every edit is logged with namespace / locale / key for audit.
   */
  route.post({
    path: '/api/i18n/sources/:namespace/:locale',
    params: z.object({
      namespace: z.string(),
      locale: z.string(),
    }),
    body: editKeyBody,
    handler: async ({ inject, params, body }) => {
      ensureI18nEditsEnabled();
      const i18n = inject(I18nService);
      const logger = inject(Logger).withSource('i18n');
      try {
        await i18n.writeSourceKey(params.namespace, params.locale, body.key, body.value);
        logger.info('Translation edited', {
          namespace: params.namespace,
          locale: params.locale,
          key: body.key,
        });
      } catch (e) {
        if (isUnsafeKeyPathError(e)) {
          throw new BadRequest(e.message);
        }
        const message = e instanceof Error ? e.message : 'Unknown source file';
        throw new NotFound(message);
      }
      return { ok: true };
    },
  }),
];
