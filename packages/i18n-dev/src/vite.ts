import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { generateNamespaceList, generateResourceTypes } from './generate';
import {
  HMR_EVENT,
  HMR_FIX,
  HMR_FIX_RESULT,
  HMR_REQUEST,
  HMR_SAVE,
  HMR_SAVE_RESULT,
  HMR_TRANSLATIONS,
  HMR_USAGE,
} from './hmr-events';
import { deleteNestedValue, setNestedValue } from './nested-path';
import { discoverPluginRoots, findWorkspaceRoot, scanLocaleDirectory, scanPluginLocales } from './scan';
import type { KeyUsageMap } from './scan-usage';
import { SOURCE_EXTENSIONS, scanKeyUsages } from './scan-usage';
import type { FixEntry, I18nDevPluginOptions, ValidationResult } from './types';
import { validateLocales } from './validate';

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
 * - Auto-discovers workspace packages with `locales/` directories
 * - Scans core and plugin locale directories on startup
 * - Watches for JSON file changes and re-validates automatically
 * - Pushes validation results to the client overlay via HMR
 * - Auto-generates type declarations in node_modules/.cache
 */
export function i18nDevtools(options: I18nDevPluginOptions): Plugin {
  const referenceLocale = options.referenceLocale ?? 'en';
  const localesDir = resolve(options.localesDir);

  let rootDir = process.cwd();
  let resolvedSrcDirs: string[] = [];
  /** All dirs to scan for key usage: source dirs + locale dirs + plugin dirs. */
  let allScanDirs: string[] = [];
  /** Auto-discovered plugin root directories. */
  let pluginRoots: string[] = [];

  let lastResult: ValidationResult | null = null;
  let lastTranslations: Record<string, Record<string, Record<string, unknown>>> | null = null;
  let lastUsage: KeyUsageMap | null = null;
  /** Maps plugin package name → absolute root dir, populated during scanning. */
  let pluginPathMap = new Map<string, string>();

  /** Path to cache directory for generated files. */
  let cacheDir = '';

  /** Flatten scanned translations into { locale: { ns: data } } for the client. */
  function flattenTranslations(
    translations: Map<string, Map<string, Record<string, unknown>>>
  ): Record<string, Record<string, Record<string, unknown>>> {
    const out: Record<string, Record<string, Record<string, unknown>>> = {};
    for (const [locale, nsMap] of translations) {
      out[locale] ??= {};
      for (const [ns, data] of nsMap) {
        out[locale][ns] = data;
      }
    }
    return out;
  }

  interface ScanResult {
    validation: ValidationResult;
    translations: Record<string, Record<string, Record<string, unknown>>>;
    /** Core locale data for type generation. */
    coreTranslations: Map<string, Map<string, Record<string, unknown>>>;
  }

  async function scanPlugins(
    issues: ValidationResult['issues'],
    coverage: ValidationResult['coverage'],
    translations: Record<string, Record<string, Record<string, unknown>>>
  ) {
    if (pluginRoots.length === 0) {
      return;
    }
    const entries = await scanPluginLocales(pluginRoots);
    const pathMap = new Map<string, string>();

    for (const { packageName, rootDir: pluginRoot, locales } of entries) {
      pathMap.set(packageName, pluginRoot);
      const qualifiedNs = `plugin:${packageName}`;
      const plugin = validateLocales(locales, referenceLocale);

      for (const issue of plugin.issues) {
        issues.push({ ...issue, namespace: qualifiedNs });
      }
      for (const entry of plugin.coverage) {
        coverage.push({ ...entry, namespace: qualifiedNs });
      }
      for (const [locale, nsMap] of locales) {
        translations[locale] ??= {};
        for (const data of nsMap.values()) {
          translations[locale][qualifiedNs] = data;
        }
      }
    }

    pluginPathMap = pathMap;
  }

  async function runScan(): Promise<ScanResult> {
    const allIssues: ValidationResult['issues'] = [];
    const allCoverage: ValidationResult['coverage'] = [];

    const coreTranslations = await scanLocaleDirectory(localesDir);
    const core = validateLocales(coreTranslations, referenceLocale);
    allIssues.push(...core.issues);
    allCoverage.push(...core.coverage);

    const allTranslations = flattenTranslations(coreTranslations);
    await scanPlugins(allIssues, allCoverage, allTranslations);

    return {
      validation: { issues: allIssues, coverage: allCoverage, timestamp: Date.now() },
      translations: allTranslations,
      coreTranslations,
    };
  }

  /** Generate type declarations into the cache directory. */
  async function generateTypes(
    coreTranslations: Map<string, Map<string, Record<string, unknown>>>
  ) {
    if (!cacheDir) {
      return;
    }
    const refData = coreTranslations.get(referenceLocale);
    if (!refData) {
      return;
    }

    const namespaces = [...refData.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, content]) => ({ name, content }));

    await mkdir(cacheDir, { recursive: true });
    await Promise.all([
      writeFile(join(cacheDir, 'i18n-resources.d.ts'), generateResourceTypes(namespaces)),
      writeFile(join(cacheDir, 'i18n-namespaces.ts'), generateNamespaceList(namespaces.map((n) => n.name))),
    ]);
  }

  return {
    name: 'i18n-devtools',
    apply: 'serve',

    async configResolved(config) {
      rootDir = config.root;
      cacheDir = join(rootDir, 'node_modules/.cache/@brika/i18n-devtools');
      resolvedSrcDirs = (options.srcDirs ?? ['./src']).map((d) => resolve(rootDir, d));

      // Auto-discover plugin locales from workspace
      const wsRoot = await findWorkspaceRoot(rootDir);
      if (wsRoot) {
        pluginRoots = await discoverPluginRoots(wsRoot, localesDir);
      }

      allScanDirs = [...resolvedSrcDirs, localesDir, ...pluginRoots];
    },

    transformIndexHtml(html) {
      return html.replace(
        '</body>',
        `<script type="module" src="/@fs${ENTRY_PATH}"></script>\n</body>`
      );
    },

    configureServer(server) {
      // ── Open-in-editor endpoint ──
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/__open-in-editor')) {
          const url = new URL(req.url, 'http://localhost');
          const file = url.searchParams.get('file');
          if (!file) {
            res.statusCode = 400;
            res.end('Missing file parameter');
            return;
          }
          const filePath = resolve(rootDir, file);
          const editor = process.env.LAUNCH_EDITOR ?? process.env.VISUAL ?? process.env.EDITOR ?? 'code';
          const args = (editor === 'code' || editor.endsWith('/code'))
            ? ['--goto', filePath]
            : [filePath];
          execFile(editor, args, (err) => {
            if (err) {
              server.config.logger.warn(`[i18n-dev] Failed to open editor: ${err.message}`);
            }
          });
          res.statusCode = 200;
          res.end('OK');
          return;
        }
        next();
      });

      // Respond to overlay requests with the latest result
      server.hot.on(HMR_REQUEST, async (_data, client) => {
        if (!lastResult) {
          const scan = await runScan();
          lastResult = scan.validation;
          lastTranslations = scan.translations;
        }
        lastUsage ??= await scanKeyUsages(rootDir, allScanDirs);
        if (lastTranslations) {
          client.send(HMR_TRANSLATIONS, lastTranslations);
        }
        client.send(HMR_EVENT, lastResult);
        client.send(HMR_USAGE, lastUsage);
      });

      const scheduleValidation = createDebouncedFn(async () => {
        const scan = await runScan();
        lastResult = scan.validation;
        lastTranslations = scan.translations;
        server.hot.send(HMR_EVENT, lastResult);
        server.hot.send(HMR_TRANSLATIONS, lastTranslations);

        // Regenerate types in background
        generateTypes(scan.coreTranslations).catch(() => {});

        const errors = lastResult.issues.filter((i) => i.severity === 'error').length;
        const warnings = lastResult.issues.filter((i) => i.severity === 'warning').length;
        if (errors > 0 || warnings > 0) {
          server.config.logger.warn(`[i18n-dev] ${errors} error(s), ${warnings} warning(s)`, {
            timestamp: true,
          });
        } else {
          server.config.logger.info('[i18n-dev] All translations OK', {
            timestamp: true,
          });
        }
      }, 300);

      const scheduleUsageScan = createDebouncedFn(async () => {
        lastUsage = await scanKeyUsages(rootDir, allScanDirs);
        server.hot.send(HMR_USAGE, lastUsage);
      }, 500);

      // Watch locale directories for changes
      server.watcher.add(localesDir);
      for (const root of pluginRoots) {
        server.watcher.add(join(root, 'locales'));
      }

      const isWatchedPath = (path: string) => {
        if (!path.endsWith('.json')) {
          return false;
        }
        if (path.startsWith(localesDir)) {
          return true;
        }
        return pluginRoots.some((r) => path.startsWith(r) && path.includes('/locales/'));
      };

      const isSourceFile = (path: string) => {
        const dot = path.lastIndexOf('.');
        return dot >= 0 && SOURCE_EXTENSIONS.has(path.slice(dot));
      };

      for (const event of ['change', 'add', 'unlink'] as const) {
        server.watcher.on(event, (path) => {
          if (isWatchedPath(path)) {
            const rel = path.replace(`${process.cwd()}/`, '');
            server.config.logger.info(`[i18n-dev] ${event}: ${rel}`, {
              timestamp: true,
            });
            scheduleValidation();
          }
          if (isSourceFile(path)) {
            scheduleUsageScan();
          }
        });
      }

      // ── Save translation edits from the overlay ──
      server.hot.on(HMR_SAVE, async (data, client) => {
        const { locale, namespace, key, value } = data as {
          locale: string;
          namespace: string;
          key: string;
          value: string;
        };

        try {
          const filePath = resolveTranslationFile(locale, namespace, localesDir, pluginPathMap);
          const raw = await readFile(filePath, 'utf-8');
          const json = JSON.parse(raw) as Record<string, unknown>;
          setNestedValue(json, key, value);

          // Preserve original indentation
          const indent = detectIndent(raw);
          await writeFile(filePath, `${JSON.stringify(json, null, indent)}\n`, 'utf-8');

          server.config.logger.info(`[i18n-dev] saved ${namespace}:${key} [${locale}]`, {
            timestamp: true,
          });
          client.send(HMR_SAVE_RESULT, { success: true });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          server.config.logger.error(`[i18n-dev] save failed: ${msg}`, {
            timestamp: true,
          });
          client.send(HMR_SAVE_RESULT, { success: false, error: msg });
        }
      });

      // ── Batch-fix issues from the overlay ──
      server.hot.on(HMR_FIX, async (data, client) => {
        const fixes = (data as { fixes: FixEntry[] }).fixes;
        const result = await applyFixes(fixes, localesDir, pluginPathMap);
        server.config.logger.info(`[i18n-dev] applied ${result.applied} fix(es)`, {
          timestamp: true,
        });
        client.send(HMR_FIX_RESULT, result);
      });

      // Run initial validation once the server is ready
      scheduleValidation();
    },
  };
}

// ─── Save helpers ───────────────────────────────────────────────────────────

export function resolveTranslationFile(
  locale: string,
  namespace: string,
  localesDir: string,
  pathMap: Map<string, string>
): string {
  // Plugin namespace: "plugin:{packageName}" → {rootDir}/locales/{locale}/plugin.json
  if (namespace.startsWith('plugin:')) {
    const packageName = namespace.slice('plugin:'.length);
    const pluginRoot = pathMap.get(packageName);
    if (pluginRoot) {
      return join(pluginRoot, 'locales', locale, 'plugin.json');
    }
    throw new Error(`Unknown plugin package: ${packageName}`);
  }

  // Core locale: localesDir/{locale}/{namespace}.json
  return join(localesDir, locale, `${namespace}.json`);
}

export function applyFixToJson(json: Record<string, unknown>, fix: FixEntry): boolean {
  if (fix.type === 'set' && fix.value !== undefined) {
    setNestedValue(json, fix.key, fix.value);
    return true;
  }
  if (fix.type === 'delete') {
    deleteNestedValue(json, fix.key);
    return true;
  }
  return false;
}

export async function applyFixesToFile(fp: string, fileFixes: FixEntry[]): Promise<number> {
  const raw = await readFile(fp, 'utf-8');
  const json = JSON.parse(raw) as Record<string, unknown>;
  const indent = detectIndent(raw);
  let applied = 0;
  for (const fix of fileFixes) {
    if (applyFixToJson(json, fix)) {
      applied++;
    }
  }
  await writeFile(fp, `${JSON.stringify(json, null, indent)}\n`, 'utf-8');
  return applied;
}

export async function applyFixes(
  fixes: FixEntry[],
  localesDir: string,
  pathMap: Map<string, string>
): Promise<{ applied: number; errors: string[] }> {
  const byFile = new Map<string, FixEntry[]>();
  for (const fix of fixes) {
    const fp = resolveTranslationFile(fix.locale, fix.namespace, localesDir, pathMap);
    const group = byFile.get(fp) ?? [];
    group.push(fix);
    byFile.set(fp, group);
  }

  let applied = 0;
  const errors: string[] = [];

  for (const [fp, fileFixes] of byFile) {
    try {
      applied += await applyFixesToFile(fp, fileFixes);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { applied, errors };
}

export function detectIndent(content: string): string | number {
  const newline = content.indexOf('\n');
  if (newline === -1 || newline + 1 >= content.length) {
    return '\t';
  }
  const char = content[newline + 1];
  if (char === '\t') {
    return '\t';
  }
  if (char !== ' ') {
    return '\t';
  }
  let end = newline + 2;
  while (end < content.length && content[end] === ' ') {
    end++;
  }
  return end - newline - 1;
}
