/**
 * Static i18n KEY EXTRACTION: walks the same `t(...)` / `tp(...)` call sites
 * the injection transform rewrites (same tokenizer, so extraction and runtime
 * agree by construction) and reads the key argument out of each call:
 *
 *   t('a.b')                   → exact key `a.b`
 *   t(`a.b`)                   → exact key `a.b` (no interpolation)
 *   t(`a.${x}.label`)          → pattern `a.*.label` (each `${}` becomes `*`)
 *   t(someVariable)            → dynamic (counted, unverifiable statically)
 *   tp('pkg', 'a.b')           → exact key `a.b` (key is the second argument)
 *
 * Pure string processing (no Bun, no bundler), so it runs identically under
 * Bun and in a V8 isolate / Worker.
 */

import { readArguments, skipTemplateInterpolation } from './arguments';
import { Scanner } from './scanner';

/** One key (or key pattern) usage, with its 1-based source line. */
export interface I18nKeyUse {
  /** The key, or a pattern where `*` stands for one interpolated expression. */
  readonly key: string;
  readonly line: number;
}

export interface FileI18nUsage {
  /** Fully static keys: string literals and interpolation-free templates. */
  readonly exact: I18nKeyUse[];
  /** Template keys with interpolations, as `*` patterns (`conditions.*`). */
  readonly patterns: I18nKeyUse[];
  /** Calls whose key argument is not a literal at all (variables, calls). */
  readonly dynamic: number;
}

/** Extract every i18n key usage from one module's source. Never throws. */
export function extractI18nKeys(code: string): FileI18nUsage {
  const exact: I18nKeyUse[] = [];
  const patterns: I18nKeyUse[] = [];
  let dynamic = 0;

  const scanner = new Scanner(code);
  while (!scanner.done()) {
    const call = scanner.nextTopLevelCall();
    if (!call) {
      break;
    }
    const args = readArguments(code, call.openParen);
    if (!args) {
      continue;
    }
    // `t(key, ...)` carries the key first; `tp(pkg, key, ...)` second.
    const span = call.name === 't' ? args.spans[0] : args.spans[1];
    if (!span || span.text.length === 0) {
      continue; // `t()` with no argument is not an i18n lookup
    }
    const parsed = parseKeyExpression(code, span.start, span.end);
    if (parsed === null) {
      dynamic++;
    } else if (parsed.includes('*')) {
      patterns.push({ key: parsed, line: call.line });
    } else {
      exact.push({ key: parsed, line: call.line });
    }
  }

  return { exact, patterns, dynamic };
}

/**
 * Read a key argument span as a literal. Returns the key (with `*` standing
 * for each template interpolation) or `null` when the argument is not a
 * string/template literal.
 */
function parseKeyExpression(code: string, start: number, end: number): string | null {
  const first = code[start];
  if (first === "'" || first === '"') {
    return parseQuoted(code, start, end, first);
  }
  if (first === '`') {
    return parseTemplate(code, start, end);
  }
  return null;
}

/** The unescaped body of a plain string literal, or null if malformed. */
function parseQuoted(code: string, start: number, end: number, quote: string): string | null {
  let out = '';
  let i = start + 1;
  while (i < end) {
    const c = code[i];
    if (c === '\\') {
      out += code[i + 1] ?? '';
      i += 2;
      continue;
    }
    if (c === quote) {
      // A literal followed by more tokens (`'a' + x`) is not a plain key.
      return i === end - 1 ? out : null;
    }
    out += c;
    i += 1;
  }
  return null; // unterminated inside the span
}

/**
 * The body of a template literal with each `${...}` replaced by `*`
 * (consecutive interpolations collapse into one `*`). Returns null when the
 * template is malformed or the whole key is a single interpolation, which
 * carries no static information (treated as dynamic by the caller).
 */
function parseTemplate(code: string, start: number, end: number): string | null {
  let out = '';
  let i = start + 1;
  while (i < end) {
    const c = code[i];
    if (c === '\\') {
      out += code[i + 1] ?? '';
      i += 2;
      continue;
    }
    if (c === '`') {
      if (i !== end - 1) {
        return null; // template followed by more tokens is not a plain key
      }
      const collapsed = out.replaceAll(/\*+/g, '*');
      return collapsed === '*' ? null : collapsed;
    }
    if (c === '$' && code[i + 1] === '{') {
      out += '*';
      i = skipTemplateInterpolation(code, i + 2);
      continue;
    }
    out += c;
    i += 1;
  }
  return null; // unterminated inside the span
}
