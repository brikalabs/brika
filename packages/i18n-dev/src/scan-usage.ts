import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

/** A single usage of a translation key in a source file. */
export interface KeyUsage {
  file: string;
  line: number;
}

/** Map of `namespace:key` → list of file locations where it appears. */
export type KeyUsageMap = Record<string, KeyUsage[]>;

// ─── Patterns ──────────────────────────────────────────────────────────────

export const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json']);

/**
 * Matches `t('key')`, `t("key")`, including optional chaining and whitespace.
 * Group 1: the translation key string.
 */
const T_CALL_QUOTE_RE = /\bt\s*\(\s*['"]([^'"]+)['"]/g;

/**
 * Matches fully static template literal calls like `t(`key`)` or `t(`ns:key`)`.
 * Skips dynamic keys like `t(`ns:${var}`)` since partial prefixes would create
 * ghost entries that don't map to real translation keys.
 * Group 1: the full template literal content (no interpolation).
 */
const T_CALL_TMPL_RE = /\bt\s*\(\s*`([^`$]+)`/g;

/**
 * Matches `useTranslation('ns')` or `useTranslation("ns")`.
 * Group 1: single namespace string (may be undefined for array form).
 */
const USE_TRANSLATION_RE = /useTranslation\s*\(\s*['"]([^'"]+)['"]/g;

/**
 * Matches `$t(ns:key)` references in JSON locale files (i18next cross-references).
 * Group 1: the qualified key (e.g. `dashboard:stats.pluginsSuffix`).
 */
const JSON_T_REF_RE = /\$t\(([^)]+)\)/g;

/**
 * Matches qualified translation key strings in JSON files: `"ns:dotted.key"`.
 * Requires namespace (word chars/hyphens), colon, then a dotted key path.
 */
const JSON_QUALIFIED_KEY_RE = /"([a-zA-Z][\w-]*:[a-zA-Z][\w.-]*)"/g;

// ─── File walker ───────────────────────────────────────────────────────────

async function walkSourceFiles(dir: string, files: string[], skipDirs: Set<string>): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.startsWith('.') || skipDirs.has(entry)) {
      continue;
    }
    const fullPath = join(dir, entry);
    const info = await stat(fullPath).catch(() => null);
    if (!info) {
      continue;
    }
    if (info.isDirectory()) {
      await walkSourceFiles(fullPath, files, skipDirs);
    } else if (SOURCE_EXTENSIONS.has(extname(entry))) {
      files.push(fullPath);
    }
  }
}

function extname(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot) : '';
}

// ─── Scanner ───────────────────────────────────────────────────────────────

function addUsage(
  usageMap: KeyUsageMap,
  rawKey: string,
  defaultNs: string | null,
  file: string,
  line: number
) {
  if (!rawKey) {
    return;
  }
  let qualifiedKey: string;
  if (rawKey.includes(':')) {
    qualifiedKey = rawKey;
  } else if (defaultNs) {
    qualifiedKey = `${defaultNs}:${rawKey}`;
  } else {
    qualifiedKey = rawKey;
  }
  const existing = usageMap[qualifiedKey];
  if (existing) {
    if (!existing.some((u) => u.file === file && u.line === line)) {
      existing.push({ file, line });
    }
  } else {
    usageMap[qualifiedKey] = [{ file, line }];
  }
}

function scanSourceFile(content: string, relPath: string, usageMap: KeyUsageMap) {
  const lines = content.split('\n');

  // Detect default namespace from useTranslation('ns')
  const nsMatches = [...content.matchAll(USE_TRANSLATION_RE)];
  const firstNsMatch = nsMatches[0];
  const defaultNs = firstNsMatch ? (firstNsMatch[1] ?? null) : null;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx] ?? '';
    const lineNum = lineIdx + 1;

    T_CALL_QUOTE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = T_CALL_QUOTE_RE.exec(line)) !== null) {
      addUsage(usageMap, match[1] ?? '', defaultNs, relPath, lineNum);
    }

    T_CALL_TMPL_RE.lastIndex = 0;
    while ((match = T_CALL_TMPL_RE.exec(line)) !== null) {
      addUsage(usageMap, match[1] ?? '', defaultNs, relPath, lineNum);
    }
  }
}

function scanJsonFile(content: string, relPath: string, usageMap: KeyUsageMap) {
  const lines = content.split('\n');

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx] ?? '';
    const lineNum = lineIdx + 1;

    // Match $t(ns:key) cross-references in locale JSON
    JSON_T_REF_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = JSON_T_REF_RE.exec(line)) !== null) {
      addUsage(usageMap, match[1] ?? '', null, relPath, lineNum);
    }

    // Match qualified "ns:key.path" strings
    JSON_QUALIFIED_KEY_RE.lastIndex = 0;
    while ((match = JSON_QUALIFIED_KEY_RE.exec(line)) !== null) {
      addUsage(usageMap, match[1] ?? '', null, relPath, lineNum);
    }
  }
}

/**
 * Scan source files for translation key references (`t('key')` calls).
 *
 * Returns a map of `namespace:key` → list of `{ file, line }` usages.
 * The `rootDir` is used to produce relative file paths in the output.
 */
export async function scanKeyUsages(rootDir: string, srcDirs: string[]): Promise<KeyUsageMap> {
  const skipDirs = new Set(['node_modules', 'dist', 'build', '.git', 'locales']);
  const files: string[] = [];

  for (const dir of srcDirs) {
    await walkSourceFiles(dir, files, skipDirs);
  }

  const usageMap: KeyUsageMap = {};

  for (const filePath of files) {
    let content: string;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch {
      continue;
    }

    const relPath = relative(rootDir, filePath);
    if (filePath.endsWith('.json')) {
      scanJsonFile(content, relPath, usageMap);
    } else {
      scanSourceFile(content, relPath, usageMap);
    }
  }

  return usageMap;
}
