/**
 * Lightweight JS/TS token tokenizer used by the i18n key scanner.
 *
 * Knows nothing about `t()` / `tp()` — it only parses the next argument at a
 * call site and walks past quoted strings, template literals (including
 * interpolation), and bracketed blocks. Keeping this layer i18n-agnostic lets
 * the dispatcher above stay short and lets the tokenizer be unit-tested on
 * its own.
 */

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

export function skipWhitespace(src: string, from: number): number {
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
export function findTemplateClose(src: string, from: number): number {
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
export function skipBraceBody(src: string, from: number): number {
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
export function lineFromOffset(src: string, offset: number): number {
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
  let i = end;
  while (i < src.length && /\s/.test(src[i] ?? '')) {
    i++;
  }
  return src[i] === '(' && !isIdent(after);
}

/** Find the first occurrence of `name(` (with boundary check). */
export function findCallName(src: string, name: string): number {
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
export function* iterateCallSites(src: string, name: string): Generator<number> {
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
