import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

/** A single usage of a translation key in a source file. */
export interface KeyUsage {
  file: string;
  line: number;
}

/** Map of `namespace:key` → list of file locations where it appears. */
export type KeyUsageMap = Record<string, KeyUsage[]>;

// ─── File walker ───────────────────────────────────────────────────────────

export const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json']);
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

// ─── JSON regex (kept — JSON has fewer ambiguities than JS) ────────────────

/**
 * Matches `$t(ns:key)` references in JSON locale files (i18next cross-references).
 * Group 1: the qualified key (e.g. `dashboard:stats.pluginsSuffix`).
 */
const JSON_T_REF_RE = /\$t\(([^)]+)\)/g;

/**
 * Matches qualified translation key strings inside JSON values. Two namespace
 * shapes are accepted: a plain identifier (`nav:groups.overview`) and a
 * colon-bearing prefix (`plugin:@scope/foo:stats.feelsLike`).
 */
const JSON_QUALIFIED_KEY_RE =
  /"((?:[a-zA-Z][\w@/.-]*:[a-zA-Z@][\w@/.-]*|[a-zA-Z][\w-]*):[a-zA-Z][\w.-]*)"/g;

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

// ─── AST-based source scanning ────────────────────────────────────────────

/**
 * Match a string literal argument: `'foo'`, `"foo"`, or a bare template `\`foo\``.
 * Template-literal interpolations (`\`pre${x}\``) are intentionally skipped —
 * partial prefixes would create ghost entries that don't map to real keys.
 *
 * Returns `null` for non-static or empty literals.
 */
function readStringArg(src: string, from: number): { value: string; nextIndex: number } | null {
  // Skip whitespace
  let i = from;
  while (i < src.length && /\s/.test(src[i] ?? '')) {
    i++;
  }
  if (i >= src.length) {
    return null;
  }
  const quote = src[i];
  if (quote !== "'" && quote !== '"' && quote !== '`') {
    return null;
  }
  // Find closing quote (handling escapes)
  let j = i + 1;
  while (j < src.length) {
    const ch = src[j];
    if (ch === '\\') {
      j += 2;
      continue;
    }
    if (ch === quote) {
      break;
    }
    // Template literal interpolation — bail out, treat as dynamic.
    if (quote === '`' && ch === '$' && src[j + 1] === '{') {
      return null;
    }
    j++;
  }
  if (j >= src.length) {
    return null;
  }
  const raw = src.slice(i + 1, j);
  return { value: raw, nextIndex: j + 1 };
}

/** Compute 1-based line number for a string offset. */
function lineFromOffset(src: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < src.length; i++) {
    if (src[i] === '\n') {
      line++;
    }
  }
  return line;
}

/**
 * Identifier boundary check: a "call" matches only when the call name isn't
 * a substring of a longer identifier. `_t(` and `cat(` don't fire as `t(`;
 * `setUseTranslation(` doesn't fire as `useTranslation(`.
 */
function isCallBoundary(src: string, start: number, end: number): boolean {
  const before = start > 0 ? (src[start - 1] ?? '') : '';
  const after = src[end] ?? '';
  const isIdent = (c: string) => /[A-Za-z0-9_$]/.test(c);
  if (before && isIdent(before)) {
    return false;
  }
  // After the name, expect optional whitespace then `(`
  let i = end;
  while (i < src.length && /\s/.test(src[i] ?? '')) {
    i++;
  }
  return src[i] === '(' && !isIdent(after);
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
  // First pass: find a `useTranslation('ns')` to use as the file-level default.
  let defaultNs: string | null = inheritedNamespace;
  const utIdx = findCallName(content, 'useTranslation');
  if (utIdx >= 0) {
    const open = content.indexOf('(', utIdx);
    if (open >= 0) {
      const arg = readStringArg(content, open + 1);
      if (arg) {
        defaultNs = arg.value;
      }
    }
  }

  // Second pass: t(...) calls.
  for (const callIdx of iterateCallSites(content, 't')) {
    const open = content.indexOf('(', callIdx);
    if (open < 0) {
      continue;
    }
    const arg = readStringArg(content, open + 1);
    if (!arg) {
      continue;
    }
    addUsage(usageMap, arg.value, defaultNs, relPath, lineFromOffset(content, callIdx));
  }

  // Third pass: tp(...) calls (plugin-namespaced helper).
  for (const callIdx of iterateCallSites(content, 'tp')) {
    const open = content.indexOf('(', callIdx);
    if (open < 0) {
      continue;
    }
    const first = readStringArg(content, open + 1);
    if (!first) {
      continue;
    }
    // Skip comma
    let p = first.nextIndex;
    while (p < content.length && /\s/.test(content[p] ?? '')) {
      p++;
    }
    if (content[p] !== ',') {
      continue;
    }
    const second = readStringArg(content, p + 1);
    if (!second) {
      continue;
    }
    // `tp(<id>, <key>)` qualifies as `<id>:<key>` — host decides what `<id>`
    // means (plugin namespace, package id, etc.). Kept verbatim.
    addUsage(
      usageMap,
      `${first.value}:${second.value}`,
      null,
      relPath,
      lineFromOffset(content, callIdx)
    );
  }
}

/** Find the first occurrence of `name(` (with boundary check). */
function findCallName(src: string, name: string): number {
  let from = 0;
  for (;;) {
    const idx = src.indexOf(name, from);
    if (idx < 0) {
      return -1;
    }
    if (isCallBoundary(src, idx, idx + name.length)) {
      return idx;
    }
    from = idx + 1;
  }
}

/** Yield every offset where `name(` appears with proper word boundaries. */
function* iterateCallSites(src: string, name: string): Generator<number> {
  let from = 0;
  for (;;) {
    const idx = src.indexOf(name, from);
    if (idx < 0) {
      return;
    }
    if (isCallBoundary(src, idx, idx + name.length)) {
      yield idx;
    }
    from = idx + 1;
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
  const usageMap: KeyUsageMap = {};

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
