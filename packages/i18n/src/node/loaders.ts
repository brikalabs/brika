import { deepMerge } from '../merge';
import { isTranslationData, type LocaleNamespaceMap, type TranslationData } from '../types';

export type LoaderWarn = (message: string, context: { path: string }, error?: unknown) => void;

/**
 * Result of loading a folder whose JSON files merge into a single namespace.
 * Carries the merged data alongside per-leaf-key provenance so writers can
 * route edits back to the file that originally contained the key.
 */
export interface MergedLocaleFolder {
  readonly data: TranslationData;
  /** Absolute paths to every JSON file that contributed (sorted). */
  readonly contributingFiles: readonly string[];
  /**
   * Dotted leaf key → absolute path of the file that supplied it. For keys
   * present in multiple files, the value reflects the *last* file in sorted
   * order (matching how `deepMerge` resolves the same collision).
   */
  readonly keyOrigins: ReadonlyMap<string, string>;
}

/**
 * Load every `*.json` file under `folderPath` as its own namespace, keyed by
 * the file basename (`<ns>.json` → namespace `<ns>`). The hub locales layout.
 */
export async function loadLocaleFolder(
  folderPath: string,
  warn?: LoaderWarn
): Promise<LocaleNamespaceMap> {
  const result: LocaleNamespaceMap = {};
  for (const { file, content } of await readJsonFiles(folderPath, warn)) {
    const namespace = file.replace(/\.json$/, '');
    result[namespace] = content;
  }
  return result;
}

/**
 * Load every `*.json` file under `folderPath` and deep-merge into a single
 * `TranslationData` tree. Also returns each leaf key's origin file so writers
 * can route dot-path edits back to the file that originally supplied the key —
 * instead of always landing on the alphabetically-first / convention-named
 * "primary" file and silently duplicating keys across files.
 */
export async function loadMergedLocaleFolder(
  folderPath: string,
  warn?: LoaderWarn
): Promise<MergedLocaleFolder> {
  let merged: TranslationData = {};
  const keyOrigins = new Map<string, string>();
  const contributingFiles: string[] = [];

  for (const { filePath, content } of await readJsonFiles(folderPath, warn)) {
    recordLeafOrigins(content, '', filePath, keyOrigins);
    merged = deepMerge(merged, content);
    contributingFiles.push(filePath);
  }

  return { data: merged, keyOrigins, contributingFiles };
}

/**
 * Choose a single canonical writable file for a merged-folder source. Used
 * when adding a *new* key (no existing origin to route to). Prefers
 * `<preferredBasename>.json`, falling back to the alphabetically-first
 * `.json` file.
 */
export async function pickPrimaryLocaleFile(
  folderPath: string,
  preferredBasename: string
): Promise<string | null> {
  const preferred = `${folderPath}/${preferredBasename}.json`;
  if (await Bun.file(preferred).exists()) {
    return preferred;
  }
  try {
    const glob = new Bun.Glob('*.json');
    const files = await Array.fromAsync(glob.scan({ cwd: folderPath }));
    files.sort((a, b) => a.localeCompare(b));
    const [first] = files;
    if (typeof first !== 'string') {
      return null;
    }
    return `${folderPath}/${first}`;
  } catch {
    return null;
  }
}

/**
 * Detect the indentation used in an existing JSON file by looking at the first
 * line break. Returns the literal `'\t'` for tab-indented files, a digit
 * (2, 4, …) for space-indented files, and 2 as a fallback for empty / unreadable
 * files. Callers pass the return value straight to `JSON.stringify(data, null, indent)`.
 */
export async function detectFileIndent(path: string): Promise<string | number> {
  try {
    const raw = await Bun.file(path).text();
    return detectIndentFromContent(raw);
  } catch {
    return 2;
  }
}

/**
 * Variant of `detectFileIndent` that operates on already-loaded content.
 * Same fallback policy (2 spaces). Use this when the caller has read the file
 * via a different code path (e.g. `node:fs/promises.readFile`) and doesn't
 * want to round-trip through `Bun.file` just for indent detection.
 */
export function detectIndentFromContent(content: string): string | number {
  const newline = content.indexOf('\n');
  if (newline === -1 || newline + 1 >= content.length) {
    return 2;
  }
  const next = content[newline + 1];
  if (next === '\t') {
    return '\t';
  }
  if (next !== ' ') {
    return 2;
  }
  let end = newline + 2;
  while (end < content.length && content[end] === ' ') {
    end++;
  }
  return end - newline - 1;
}

// ─── Internals ──────────────────────────────────────────────────────────────

interface JsonFileEntry {
  /** Relative basename (e.g. `permissions.json`). */
  readonly file: string;
  /** Absolute path. */
  readonly filePath: string;
  /** Validated translation data. */
  readonly content: TranslationData;
}

async function readJsonFiles(folderPath: string, warn?: LoaderWarn): Promise<JsonFileEntry[]> {
  const out: JsonFileEntry[] = [];
  let files: string[];
  try {
    const glob = new Bun.Glob('*.json');
    files = await Array.fromAsync(glob.scan({ cwd: folderPath }));
  } catch {
    return out;
  }
  files.sort((a, b) => a.localeCompare(b));
  for (const file of files) {
    const filePath = `${folderPath}/${file}`;
    try {
      const content: unknown = await Bun.file(filePath).json();
      if (isTranslationData(content)) {
        out.push({ file, filePath, content });
      } else {
        warn?.('Translation file root is not an object', { path: filePath });
      }
    } catch (error) {
      warn?.('Failed to load translation file', { path: filePath }, error);
    }
  }
  return out;
}

function recordLeafOrigins(
  data: TranslationData,
  prefix: string,
  filePath: string,
  origins: Map<string, string>
): void {
  for (const [key, value] of Object.entries(data)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isTranslationData(value)) {
      recordLeafOrigins(value, path, filePath, origins);
    } else {
      origins.set(path, filePath);
    }
  }
}
