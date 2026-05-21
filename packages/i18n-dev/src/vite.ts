import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findWorkspaceRoot } from '@brika/i18n/node';
import type { Plugin } from 'vite';
import { HMR_EVENT, HMR_REQUEST, HMR_TRANSLATIONS, HMR_USAGE } from './hmr-events';
import {
  generateTypes,
  type ResolvedSource,
  runScan,
} from './server/orchestrator';
import { createOpenInEditorMiddleware } from './server/open-in-editor';
import { createSaveHandlerMiddleware } from './server/save-handler';
import { startHubSseClient } from './server/sse-client';
import { logStartupSummary } from './server/startup-log';
import {
  type KeyUsageMap,
  type ScanRoot,
  SOURCE_EXTENSIONS,
  scanKeyUsages,
} from './scan-usage';
import type { I18nDevPluginOptions, ValidationResult } from './types';

/** Absolute path to the overlay entry file (resolved at import time). */
const ENTRY_PATH = fileURLToPath(new URL('./entry.ts', import.meta.url));

function createDebouncedFn(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
}

/**
 * Vite plugin that validates i18n translations during development.
 *
 * - Auto-injects the i18n DevTools overlay into the page
 * - Scans configured `sources[]` for `t()` usages and locale data
 * - Watches for JSON file changes and re-validates automatically
 * - Pushes validation results to the client overlay via HMR
 * - Exposes `POST /__i18n-write` for the overlay to save edits
 * - Auto-generates type declarations in `node_modules/.cache`
 */
export function i18nDevtools(options: I18nDevPluginOptions = {}): Plugin {
  const referenceLocale = options.referenceLocale ?? 'en';
  const explicitApiUrl = options.apiUrl?.replace(/\/$/, '');
  const apiUrl =
    explicitApiUrl ?? (options.hub ? `${options.hub.replace(/\/$/, '')}/api/i18n` : null);

  if (!options.localesDir && !apiUrl) {
    throw new Error(
      '@brika/i18n-devtools: pass either `localesDir` (local files), `hub` (origin URL), or `apiUrl` (explicit API base) — none provided.'
    );
  }

  let localesDir: string | null = null;
  let rootDir = process.cwd();
  let sources: ResolvedSource[] = [];
  let scanRoots: ScanRoot[] = [];
  let workspaceRoot: string | null = null;

  let lastResult: ValidationResult | null = null;
  let lastTranslations: Record<string, Record<string, Record<string, unknown>>> | null = null;
  let lastUsage: KeyUsageMap | null = null;

  let cacheDir = '';

  return {
    name: 'i18n-devtools',
    apply: 'serve',

    async configResolved(config) {
      rootDir = config.root;
      cacheDir = join(rootDir, 'node_modules/.cache/@brika/i18n-devtools');

      if (options.localesDir) {
        localesDir = resolve(rootDir, options.localesDir);
      }

      const wsRoot = await findWorkspaceRoot(rootDir);
      workspaceRoot = wsRoot ?? null;

      const inputSources = options.sources ?? [{ dir: './src' }];
      sources = inputSources.map<ResolvedSource>((source) => ({
        dir: resolve(rootDir, source.dir),
        namespace: source.namespace,
        localesDir: source.localesDir ? resolve(rootDir, source.localesDir) : undefined,
      }));

      scanRoots = [
        ...sources.map<ScanRoot>((s) => ({ dir: s.dir, namespace: s.namespace })),
        ...(localesDir ? [{ dir: localesDir }] : []),
        ...sources
          .filter((s): s is ResolvedSource & { localesDir: string } => s.localesDir !== undefined)
          .map<ScanRoot>((s) => ({ dir: s.localesDir })),
      ];

      logStartupSummary(config.logger, {
        localesDir,
        apiUrl,
        sourceCount: sources.length,
        rootDir,
      });
    },

    transformIndexHtml(html) {
      return html.replace(
        '</body>',
        `<script type="module" src="/@fs${ENTRY_PATH}"></script>\n</body>`
      );
    },

    configureServer(server) {
      server.middlewares.use(
        createOpenInEditorMiddleware({
          viteRoot: rootDir,
          workspaceRoot,
          logger: server.config.logger,
        })
      );
      server.middlewares.use(
        createSaveHandlerMiddleware({
          localesDir,
          apiUrl,
          logger: server.config.logger,
        })
      );

      const orchestratorOptions = {
        localesDir,
        apiUrl,
        referenceLocale,
        sources,
        cacheDir,
      };

      // Respond to overlay requests with the latest result.
      server.hot.on(HMR_REQUEST, async (_data, client) => {
        if (!lastResult) {
          const scan = await runScan(orchestratorOptions);
          lastResult = scan.validation;
          lastTranslations = scan.translations;
        }
        lastUsage ??= await scanKeyUsages(rootDir, scanRoots);
        if (lastTranslations) {
          client.send(HMR_TRANSLATIONS, lastTranslations);
        }
        client.send(HMR_EVENT, lastResult);
        client.send(HMR_USAGE, lastUsage);
      });

      const scheduleValidation = createDebouncedFn(async () => {
        const scan = await runScan(orchestratorOptions);
        lastResult = scan.validation;
        lastTranslations = scan.translations;
        server.hot.send(HMR_EVENT, lastResult);
        server.hot.send(HMR_TRANSLATIONS, lastTranslations);

        generateTypes(orchestratorOptions, scan.coreTranslations, scan.translations).catch(() => {
          // Type generation runs in background; failures are non-fatal here.
        });

        const errors = lastResult.issues.filter((i) => i.severity === 'error').length;
        const warnings = lastResult.issues.filter((i) => i.severity === 'warning').length;
        if (errors > 0 || warnings > 0) {
          server.config.logger.warn(`[i18n-dev] ${errors} error(s), ${warnings} warning(s)`, {
            timestamp: true,
          });
        } else {
          server.config.logger.info('[i18n-dev] All translations OK', { timestamp: true });
        }
      }, 300);

      const scheduleUsageScan = createDebouncedFn(async () => {
        lastUsage = await scanKeyUsages(rootDir, scanRoots);
        server.hot.send(HMR_USAGE, lastUsage);
      }, 500);

      if (apiUrl) {
        const stop = startHubSseClient({ apiUrl, onChange: scheduleValidation });
        server.httpServer?.once('close', stop);
      }

      if (localesDir) {
        server.watcher.add(localesDir);
      }
      for (const s of sources) {
        if (s.localesDir) {
          server.watcher.add(s.localesDir);
        }
      }

      const isWatchedPath = (path: string) => {
        if (!path.endsWith('.json')) {
          return false;
        }
        if (localesDir && path.startsWith(localesDir)) {
          return true;
        }
        return sources.some((s) => s.localesDir && path.startsWith(s.localesDir));
      };

      const isSourceFile = (path: string) => {
        const dot = path.lastIndexOf('.');
        return dot >= 0 && SOURCE_EXTENSIONS.has(path.slice(dot));
      };

      for (const event of ['change', 'add', 'unlink'] as const) {
        server.watcher.on(event, (path) => {
          if (isWatchedPath(path)) {
            const rel = path.replace(`${rootDir}/`, '');
            server.config.logger.info(`[i18n-dev] ${event}: ${rel}`, { timestamp: true });
            scheduleValidation();
          }
          if (isSourceFile(path)) {
            scheduleUsageScan();
          }
        });
      }

      // Run initial validation once the server is ready.
      scheduleValidation();
    },
  };
}
