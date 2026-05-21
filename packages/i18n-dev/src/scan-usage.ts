import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

/** A single usage of a translation key in a source file. */
export interface KeyUsage {
  file: string;
  line: number;
}

/** Map of `namespace:key` → list of file locations where it appears. */
export type KeyUsageRecord = Record<string, KeyUsage[]>;

/**
 * Result of a static scan. Carries enough information for the validator to
 * be **100% accurate**: every locale key is either provably used, provably
 * dead, or in a namespace where dynamic calls make detection unreliable
 * (`opaqueNamespaces` / `hasGlobalOpaque`). The validator skips dead-key
 * reporting for uncertain cases rather than producing false positives.
 */
export interface KeyUsageMap {
  /** Statically-resolvable key references (`t('ns:key')`, `t(\`ns:key\`)`). */
  keys: KeyUsageRecord;
  /**
   * Static prefixes from template literals — `t(\`auth:rules.${x}\`)` yields
   * prefix `'auth:rules.'`. Any locale key starting with one of these is
   * considered used (the dynamic suffix could resolve to any of them).
   */
  patterns: string[];
  /**
   * Namespaces where the scanner observed an opaque dynamic call —
   * `t(someVar)` inside a file with `useTranslation('auth')` lands here as
   * `'auth'`. Locale keys under any of these are treated as potentially used.
   */
  opaqueNamespaces: string[];
  /**
   * Set when the scanner saw a fully unscoped opaque call — `t(varName)`
   * with no namespace context, or `t(\`${ns}:${key}\`)` with a dynamic
   * namespace. When true, the validator suppresses dead-key reporting
   * entirely because any key in any namespace could be the target.
   */
  hasGlobalOpaque: boolean;
}

export function emptyKeyUsageMap(): KeyUsageMap {
  return { keys: {}, patterns: [], opaqueNamespaces: [], hasGlobalOpaque: false };
}

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

// ─── Scanner — helpers that mutate the KeyUsageMap ─────────────────────────

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

// ─── AST-based source scanning ────────────────────────────────────────────

export type ParsedArg =
  /** No argument at the call site (empty parens or end of input). */
  | { kind: 'none' }
  /** Plain literal: `'foo'`, `"foo"`, or backtick-string with no interpolation. */
  | { kind: 'static'; value: string; nextIndex: number }
  /** Template literal with interpolation — `value` is the static prefix before the first `${`. */
  | { kind: 'prefix'; value: string; nextIndex: number }
  /** Argument is non-string (variable, function call, fully-dynamic template). */
  | { kind: 'opaque'; nextIndex: number };

/**
 * Parse the next argument of a function call starting at offset `from`. The
 * scanner needs four cases distinguished:
 *
 *   - `t('foo')`              → static
 *   - `t(\`foo\`)`            → static
 *   - `t(\`pre.${x}\`)`       → prefix (value = `'pre.'`)
 *   - `t(varName)`            → opaque
 *   - `t()`                   → none
 *
 * `nextIndex` always points just past the consumed argument; the caller uses
 * it to scan for a comma + next arg (for `tp(ns, key)`) or to advance past
 * the call.
 */
export function readStringArg(src: string, from: number): ParsedArg {
  const i = skipWhitespace(src, from);
  if (i >= src.length) {
    return { kind: 'none' };
  }
  const first = src[i];
  if (first === ')') {
    return { kind: 'none' };
  }
  if (first === "'" || first === '"' || first === '`') {
    return readQuoted(src, i, first);
  }
  return { kind: 'opaque', nextIndex: skipOpaqueArg(src, i) };
}

function skipWhitespace(src: string, from: number): number {
  let i = from;
  while (i < src.length && /\s/.test(src[i] ?? '')) {
    i++;
  }
  return i;
}

function readQuoted(src: string, openIdx: number, quote: string): ParsedArg {
  let j = openIdx + 1;
  while (j < src.length) {
    const ch = src[j];
    if (ch === '\\') {
      j += 2;
      continue;
    }
    if (ch === quote) {
      return { kind: 'static', value: src.slice(openIdx + 1, j), nextIndex: j + 1 };
    }
    if (quote === '`' && ch === '$' && src[j + 1] === '{') {
      const prefix = src.slice(openIdx + 1, j);
      const closeBacktick = findTemplateClose(src, j);
      const nextIndex = closeBacktick === -1 ? src.length : closeBacktick + 1;
      return { kind: 'prefix', value: prefix, nextIndex };
    }
    j++;
  }
  return { kind: 'opaque', nextIndex: src.length };
}

/**
 * Find the closing backtick of a template that opens at `from` (pointing at
 * the `$` of the first `${`). Skips over interpolation bodies, including
 * nested strings and template literals. Returns `-1` on unterminated input.
 */
function findTemplateClose(src: string, from: number): number {
  let j = from;
  while (j < src.length) {
    const ch = src[j];
    if (ch === '\\') {
      j += 2;
      continue;
    }
    if (ch === '`') {
      return j;
    }
    if (ch === '$' && src[j + 1] === '{') {
      j = skipBraceBody(src, j + 2);
      continue;
    }
    j++;
  }
  return -1;
}

/** Advance past a `${...}` body (starting just after `${`), handling nested braces, strings, and templates. */
function skipBraceBody(src: string, from: number): number {
  let depth = 1;
  let j = from;
  while (j < src.length && depth > 0) {
    const ch = src[j];
    if (ch === '\\') {
      j += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      j = skipPlainString(src, j);
      continue;
    }
    if (ch === '`') {
      const close = findTemplateClose(src, j + 1);
      j = close === -1 ? src.length : close + 1;
      continue;
    }
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
    }
    j++;
  }
  return j;
}

function skipPlainString(src: string, openIdx: number): number {
  const quote = src[openIdx];
  let j = openIdx + 1;
  while (j < src.length) {
    if (src[j] === '\\') {
      j += 2;
      continue;
    }
    if (src[j] === quote) {
      return j + 1;
    }
    j++;
  }
  return src.length;
}

/**
 * Advance past a non-string argument (variable, function call, member access,
 * etc.) up to the next `,` or `)` at depth 0. Tracks nesting on `()[]{}` and
 * skips string + template bodies so a `,` inside them doesn't confuse us.
 */
function skipOpaqueArg(src: string, from: number): number {
  let depth = 0;
  let j = from;
  while (j < src.length) {
    const step = stepThroughOpaqueChar(src, j, depth);
    if (step.terminated) {
      return j;
    }
    j = step.next;
    depth = step.depth;
  }
  return src.length;
}

interface OpaqueStep {
  next: number;
  depth: number;
  terminated: boolean;
}

function stepThroughOpaqueChar(src: string, j: number, depth: number): OpaqueStep {
  const ch = src[j];
  if (ch === '\\') {
    return { next: j + 2, depth, terminated: false };
  }
  if (ch === '"' || ch === "'") {
    return { next: skipPlainString(src, j), depth, terminated: false };
  }
  if (ch === '`') {
    const close = findTemplateClose(src, j + 1);
    return { next: close === -1 ? src.length : close + 1, depth, terminated: false };
  }
  if (ch === '(' || ch === '[' || ch === '{') {
    return { next: j + 1, depth: depth + 1, terminated: false };
  }
  if (ch === ')' || ch === ']' || ch === '}') {
    if (depth === 0) {
      return { next: j, depth, terminated: true };
    }
    return { next: j + 1, depth: depth - 1, terminated: false };
  }
  if (ch === ',' && depth === 0) {
    return { next: j, depth, terminated: true };
  }
  return { next: j + 1, depth, terminated: false };
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
  // 'none' → no signal.
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
      addStaticUsage(usageMap, match[1] ?? '', null, relPath, lineNum);
    }

    // Match qualified "ns:key.path" strings
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
