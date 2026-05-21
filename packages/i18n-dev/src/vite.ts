import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TranslationData } from '@brika/i18n';
import { findWorkspaceRoot } from '@brika/i18n/node';
import type { Plugin } from 'vite';
import { HMR_EVENT, HMR_REQUEST, HMR_TRANSLATIONS, HMR_USAGE } from './hmr-events';
import { type KeyUsageMap, type ScanRoot, SOURCE_EXTENSIONS, scanKeyUsages } from './scan-usage';
import { logIssueReport } from './server/log-issues';
import { createOpenInEditorMiddleware } from './server/open-in-editor';
import {
  generateTypes,
  mergeCodeUsageIssues,
  type ResolvedSource,
  runScan,
} from './server/orchestrator';
import { createSaveHandlerMiddleware } from './server/save-handler';
import { startHubSseClient } from './server/sse-client';
import { logStartupSummary } from './server/startup-log';
import type { I18nDevPluginOptions, ValidationResult } from './types';

// Re-exported so a `vite.config.ts` author can grab option types from the
// same entry as the plugin itself.
export type { I18nDevPluginOptions, SourceConfig } from './types';

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
  const defaultNamespace = options.defaultNamespace ?? 'translation';
  const explicitApiUrl = options.apiUrl?.replace(/\/$/, '');
  const apiUrl =
    explicitApiUrl ?? (options.remote ? `${options.remote.replace(/\/$/, '')}/api/i18n` : null);

  const hasFileSource = Boolean(options.localesDir || options.sources?.some((s) => s.localesDir));
  if (!hasFileSource && !apiUrl) {
    throw new Error(
      '@brika/i18n-devtools: configure at least one translation source — `localesDir`, an entry in `sources` with `localesDir`, or `remote`/`apiUrl` for an HTTP-served bundle.'
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
      // Generated augmentation uses `declare global { namespace BrikaI18n }`
      // so module resolution doesn't gate the merge — files in
      // `node_modules/.cache/` work just as well as anywhere else, and they
      // stay out of the consumer's source tree.
      cacheDir = options.typesDir
        ? resolve(rootDir, options.typesDir)
        : join(rootDir, 'node_modules/.cache/@brika/i18n-devtools');

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
        defaultNamespace,
        sources,
        cacheDir,
        tpNamespacePrefixes: options.tpNamespacePrefixes,
        deadKeyIgnoreNamespaces: options.deadKeyIgnoreNamespaces,
        unknownKeySeverity: options.unknownKeySeverity,
        deadKeySeverity: options.deadKeySeverity,
      };

      // Static-scan paths are reported relative to the workspace root so they
      // line up with the compiler-injected `__cs` field (also workspace-root
      // relative). Without this alignment the same file shows up twice — once
      // as `../../plugins/<x>/...` from the static scan and once as
      // `plugins/<x>/...` from runtime, defeating the file:line dedup.
      const usageRoot = workspaceRoot ?? rootDir;

      // Last *purely-locale* validation snapshot. We keep it separate from
      // `lastResult` so the code-vs-locale cross-validation (which depends on
      // `lastUsage`) can be re-overlaid without rescanning the JSON files.
      let lastCoreTranslations: Map<string, Map<string, TranslationData>> = new Map();
      let lastLocaleValidation: ValidationResult | null = null;

      function rebuildIssues(): void {
        if (!lastLocaleValidation) {
          return;
        }
        lastResult = lastUsage
          ? mergeCodeUsageIssues(
              lastLocaleValidation,
              lastCoreTranslations,
              lastUsage,
              orchestratorOptions
            )
          : lastLocaleValidation;
        server.hot.send(HMR_EVENT, lastResult);
        // Skip logging on the very first locale-parity pass before the
        // key-usage scan has caught up — otherwise we'd log "All OK", then
        // immediately log "N errors" 200ms later when the code↔locale check
        // adds its own issues. Wait until both halves have run at least once.
        if (lastUsage !== null) {
          logIssueReport(server.config.logger, lastResult.issues);
        }
      }

      // Respond to overlay requests with the latest result.
      server.hot.on(HMR_REQUEST, async (_data, client) => {
        if (!lastLocaleValidation) {
          const scan = await runScan(orchestratorOptions);
          lastLocaleValidation = scan.validation;
          lastCoreTranslations = scan.coreTranslations;
          lastTranslations = scan.translations;
        }
        lastUsage ??= await scanKeyUsages(usageRoot, scanRoots);
        rebuildIssues();
        if (lastTranslations) {
          client.send(HMR_TRANSLATIONS, lastTranslations);
        }
        if (lastResult) {
          client.send(HMR_EVENT, lastResult);
        }
        client.send(HMR_USAGE, lastUsage);
      });

      const scheduleValidation = createDebouncedFn(async () => {
        const scan = await runScan(orchestratorOptions);
        lastLocaleValidation = scan.validation;
        lastCoreTranslations = scan.coreTranslations;
        lastTranslations = scan.translations;
        server.hot.send(HMR_TRANSLATIONS, lastTranslations);
        rebuildIssues();

        generateTypes(orchestratorOptions, scan.coreTranslations, scan.translations).catch(
          (err: unknown) => {
            // Non-fatal — surface so the user can investigate cache-dir perms etc.
            const detail = err instanceof Error ? err.message : String(err);
            server.config.logger.warn(`[i18n-dev] type generation failed: ${detail}`, {
              timestamp: true,
            });
          }
        );
      }, 300);

      const scheduleUsageScan = createDebouncedFn(async () => {
        lastUsage = await scanKeyUsages(usageRoot, scanRoots);
        server.hot.send(HMR_USAGE, lastUsage);
        rebuildIssues();
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

      // Run initial validation + key-usage scan so the terminal log reflects
      // both halves on first boot, even without a browser tab open.
      scheduleValidation();
      scheduleUsageScan();
    },
  };
}
