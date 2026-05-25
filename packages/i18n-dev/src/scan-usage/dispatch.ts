import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import {
  findCallName,
  iterateCallSites,
  lineFromOffset,
  type ParsedArg,
  readStringArg,
} from './tokenizer';
import type { KeyUsageMap } from './types';
import { emptyKeyUsageMap, SOURCE_EXTENSIONS } from './types';

export type { KeyUsage, KeyUsageMap, KeyUsageRecord } from './types';
export { emptyKeyUsageMap, SOURCE_EXTENSIONS } from './types';

const SCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

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

/**
 * Matches `$t(ns:key)` references in JSON locale files (i18next cross-references).
 * Group 1: the qualified key (e.g. `dashboard:stats.pluginsSuffix`).
 */
const JSON_T_REF_RE = /\$t\(([^)]+)\)/g;

/**
 * Matches qualified translation key strings inside JSON *values*. Two namespace
 * shapes are accepted: a plain identifier (`nav:groups.overview`) and a
 * colon-bearing prefix (`plugin:@scope/foo:stats.feelsLike`).
 *
 * The trailing `(?!\s*:)` lookahead excludes JSON property *keys* that happen
 * to contain `:` (e.g. `"workflow:read": "Read workflows"` — the key would
 * otherwise be mis-detected as a `t('workflow:read')` reference and the
 * validator would flag it as `unknown-key` since the real path is
 * `users:scopes.workflow:read`).
 */
const JSON_QUALIFIED_KEY_RE =
  /"((?:[a-zA-Z][\w@/.-]*:[a-zA-Z@][\w@/.-]*|[a-zA-Z][\w-]*):[a-zA-Z][\w.-]*)"(?!\s*:)/g;

function qualify(rawKey: string, defaultNs: string | null): string {
  if (rawKey.includes(':')) {
    return rawKey;
  }
  return defaultNs ? `${defaultNs}:${rawKey}` : rawKey;
}

function addStaticUsage(
  map: KeyUsageMap,
  rawKey: string,
  defaultNs: string | null,
  file: string,
  line: number
): void {
  if (!rawKey) {
    return;
  }
  const qualifiedKey = qualify(rawKey, defaultNs);
  const existing = map.keys[qualifiedKey];
  if (!existing) {
    map.keys[qualifiedKey] = [{ file, line }];
    return;
  }
  if (existing.some((u) => u.file === file && u.line === line)) {
    return;
  }
  existing.push({ file, line });
}

function addPattern(map: KeyUsageMap, rawPrefix: string, defaultNs: string | null): void {
  if (!rawPrefix) {
    // `t(\`${dynamic}\`)` — no static prefix at all. Equivalent to a fully
    // opaque key whose namespace context (if any) is `defaultNs`.
    addOpaque(map, defaultNs);
    return;
  }
  const qualifiedPrefix = qualify(rawPrefix, defaultNs);
  // Patterns are deduped — multiple call sites with the same prefix add no
  // signal beyond the first.
  if (!map.patterns.includes(qualifiedPrefix)) {
    map.patterns.push(qualifiedPrefix);
  }
}

function addOpaque(map: KeyUsageMap, namespace: string | null): void {
  if (!namespace) {
    map.hasGlobalOpaque = true;
    return;
  }
  if (!map.opaqueNamespaces.includes(namespace)) {
    map.opaqueNamespaces.push(namespace);
  }
}

/**
 * Scan a script source file (ts/tsx/js/jsx) using lightweight token-level
 * pattern matching for `t(...)`, `tp(...)`, and `useTranslation(...)` calls.
 * Operates on the raw text but uses identifier-boundary checks so that
 * `cat(...)`, `assert(...)`, `_t(...)`, etc. never produce false positives.
 *
 * Recognised forms:
 *   - `t('key')` / `t("key")` / `t(\`key\`)` — captures the literal.
 *   - `t('key', { ... })` — captures the literal (options ignored).
 *   - `tp('pluginId', 'key')` — captures both as `${pluginId}:${key}` after
 *     prefixing with the caller's namespace context.
 *   - `useTranslation('ns')` — sets the in-file default namespace.
 */
function scanSourceFile(
  content: string,
  relPath: string,
  usageMap: KeyUsageMap,
  inheritedNamespace: string | null
) {
  const defaultNs = detectDefaultNamespace(content, inheritedNamespace);
  scanTCalls(content, relPath, usageMap, defaultNs);
  scanTpCalls(content, relPath, usageMap);
}

function detectDefaultNamespace(content: string, inherited: string | null): string | null {
  const utIdx = findCallName(content, 'useTranslation');
  if (utIdx < 0) {
    return inherited;
  }
  const open = content.indexOf('(', utIdx);
  if (open < 0) {
    return inherited;
  }
  const arg = readStringArg(content, open + 1);
  // Only a literal namespace counts — `useTranslation(varName)` falls back to
  // the inherited context; we have no way to know what the variable holds.
  if (arg.kind === 'static') {
    return arg.value;
  }
  return inherited;
}

function scanTCalls(
  content: string,
  relPath: string,
  usageMap: KeyUsageMap,
  defaultNs: string | null
): void {
  for (const callIdx of iterateCallSites(content, 't')) {
    const open = content.indexOf('(', callIdx);
    if (open < 0) {
      continue;
    }
    const arg = readStringArg(content, open + 1);
    const line = lineFromOffset(content, callIdx);
    dispatchTArg(arg, usageMap, defaultNs, relPath, line);
  }
}

function dispatchTArg(
  arg: ParsedArg,
  usageMap: KeyUsageMap,
  defaultNs: string | null,
  relPath: string,
  line: number
): void {
  if (arg.kind === 'static') {
    addStaticUsage(usageMap, arg.value, defaultNs, relPath, line);
    return;
  }
  if (arg.kind === 'prefix') {
    addPattern(usageMap, arg.value, defaultNs);
    return;
  }
  if (arg.kind === 'opaque') {
    addOpaque(usageMap, defaultNs);
  }
}

function scanTpCalls(content: string, relPath: string, usageMap: KeyUsageMap): void {
  for (const callIdx of iterateCallSites(content, 'tp')) {
    const open = content.indexOf('(', callIdx);
    if (open < 0) {
      continue;
    }
    const first = readStringArg(content, open + 1);
    if (first.kind === 'none') {
      continue;
    }
    if (first.kind === 'opaque') {
      // `tp(varName, ...)` — namespace is dynamic, anything could match.
      addOpaque(usageMap, null);
      continue;
    }
    const commaIdx = findArgSeparator(content, first.nextIndex);
    if (commaIdx === -1) {
      continue;
    }
    const second = readStringArg(content, commaIdx + 1);
    const line = lineFromOffset(content, callIdx);
    dispatchTpArgs(first, second, usageMap, relPath, line);
  }
}

function findArgSeparator(content: string, from: number): number {
  let p = from;
  while (p < content.length && /\s/.test(content[p] ?? '')) {
    p++;
  }
  return content[p] === ',' ? p : -1;
}

function dispatchTpArgs(
  first: ParsedArg,
  second: ParsedArg,
  usageMap: KeyUsageMap,
  relPath: string,
  line: number
): void {
  if (first.kind !== 'static' && first.kind !== 'prefix') {
    return;
  }
  // For tp(), the first arg is the namespace. A `prefix`-kind namespace
  // (template-literal) means the runtime namespace is partially dynamic —
  // we record opaque against the static portion to stay conservative.
  if (first.kind === 'prefix') {
    addOpaque(usageMap, first.value || null);
    return;
  }
  const ns = first.value;
  if (second.kind === 'static') {
    addStaticUsage(usageMap, `${ns}:${second.value}`, null, relPath, line);
    return;
  }
  if (second.kind === 'prefix') {
    addPattern(usageMap, `${ns}:${second.value}`, null);
    return;
  }
  if (second.kind === 'opaque') {
    addOpaque(usageMap, ns);
  }
}

function scanJsonFile(content: string, relPath: string, usageMap: KeyUsageMap) {
  const lines = content.split('\n');

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx] ?? '';
    const lineNum = lineIdx + 1;

    JSON_T_REF_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = JSON_T_REF_RE.exec(line)) !== null) {
      addStaticUsage(usageMap, match[1] ?? '', null, relPath, lineNum);
    }

    JSON_QUALIFIED_KEY_RE.lastIndex = 0;
    while ((match = JSON_QUALIFIED_KEY_RE.exec(line)) !== null) {
      addStaticUsage(usageMap, match[1] ?? '', null, relPath, lineNum);
    }
  }
}

/**
 * A directory tree to scan, optionally annotated with the namespace its
 * bare-key `t()` calls implicitly belong to. The host (consuming app) supplies
 * the namespace verbatim — the dev tool does not interpret it.
 */
export interface ScanRoot {
  readonly dir: string;
  readonly namespace?: string;
}

/**
 * Scan source files for translation key references.
 *
 *   - `t('key')` / `t("key")` / `` t(`key`) `` — string literal arguments
 *   - `tp('id', 'key')` — colon-qualified helper (caller decides what `id` means)
 *   - `useTranslation('ns')` — sets the in-file default namespace
 *   - `$t(ns:key)` / qualified key strings inside JSON locale files
 */
export async function scanKeyUsages(
  rootDir: string,
  roots: ReadonlyArray<ScanRoot>
): Promise<KeyUsageMap> {
  const skipDirs = new Set(['node_modules', 'dist', 'build', '.git', 'locales']);
  const usageMap = emptyKeyUsageMap();

  for (const root of roots) {
    const files: string[] = [];
    await walkSourceFiles(root.dir, files, skipDirs);

    for (const filePath of files) {
      let content: string;
      try {
        content = await readFile(filePath, 'utf-8');
      } catch {
        continue;
      }
      const relPath = relative(rootDir, filePath);
      const ext = extname(filePath);
      if (ext === '.json') {
        scanJsonFile(content, relPath, usageMap);
      } else if (SCRIPT_EXTENSIONS.has(ext)) {
        scanSourceFile(content, relPath, usageMap, root.namespace ?? null);
      }
    }
  }

  return usageMap;
}
