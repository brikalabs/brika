/**
 * Static i18n KEY EXTRACTION: walks the same `t(...)` / `tp(...)` call sites
 * the injection transform rewrites (same tokenizer, so extraction and runtime
 * agree by construction) and RESOLVES the key argument of each call:
 *
 *   t('a.b')                   → exact key `a.b`
 *   t(`a.${x}.label`)          → pattern `a.*.label` (each `${}` becomes `*`)
 *   t(cond ? 'a.on' : 'a.off') → exact keys `a.on` AND `a.off`
 *   t('a.' + x)                → pattern `a.*` (concatenation chains)
 *   t(KEY) with `const KEY = cond ? 'a' : 'b'` → resolved through the binding
 *   t(MAP[x]) with `const MAP = { on: 'a.on', ... }` → soft keys (all values)
 *   t(item.labelKey)           → property reference, resolved plugin-wide by
 *                                the scanner against `labelKey: '<literal>'`
 *   t(someCall())              → dynamic (counted, unverifiable statically)
 *
 * Exact keys assert existence (a missing one is an error); SOFT keys come from
 * over-approximating resolutions (map values, multi-bound consts, properties)
 * and only mark locale keys as used — they never produce missing-key errors.
 *
 * Pure string processing (no Bun, no bundler), so it runs identically under
 * Bun and in a V8 isolate / Worker.
 */

import {
  readArguments,
  skipStringLiteral,
  skipTemplateInterpolation,
  skipTemplateLiteral,
  skipWhitespace,
  trimRightWhitespace,
} from './arguments';
import { Scanner } from './scanner';

/** One key (or key pattern) usage, with its 1-based source line. */
export interface I18nKeyUse {
  /** The key, or a pattern where `*` stands for one unresolvable expression. */
  readonly key: string;
  readonly line: number;
}

export interface FileI18nUsage {
  /** Fully static keys: literals, resolved ternaries/consts/concatenations. */
  readonly exact: I18nKeyUse[];
  /** Partially static keys, as `*` patterns (`conditions.*`). */
  readonly patterns: I18nKeyUse[];
  /** Over-approximated keys (map values, multi-bound consts): usage only. */
  readonly soft: I18nKeyUse[];
  /** `t(x.<prop>)` references; `key` is the property name (plugin-wide pass). */
  readonly propertyRefs: I18nKeyUse[];
  /** `t(MAP[x])` on a map not defined in this file; `key` is the map name. */
  readonly mapRefs: I18nKeyUse[];
  /** 1-based lines of calls whose key resolves to nothing static at all. */
  readonly dynamicLines: number[];
}

/** A ternary with two resolvable branches yields at most this many keys. */
const MAX_CANDIDATES = 8;
/** Expression recursion cap (nested ternaries / parens / concatenations). */
const MAX_DEPTH = 5;
/** Initializer expressions longer than this are not worth resolving. */
const MAX_INITIALIZER = 400;

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const BINDING = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]*?)?=\s*/g;
const MAP_INDEX = /^([A-Za-z_$][\w$]*)\s*\[[\s\S]+\]$/;
const PROPERTY_ACCESS = /^([A-Za-z_$][\w$]*)(?:\?\.|\.)([A-Za-z_$][\w$]*)$/;

/** The file-level name bindings the resolver consults. */
interface Bindings {
  /** Names bound once to a resolvable string expression: exact-capable. */
  readonly strings: Map<string, string[]>;
  /** Names bound more than once, or to map lookups: soft (usage only). */
  readonly soft: Map<string, string[]>;
  /** Names bound to object literals: their string values (for `MAP[x]`). */
  readonly objects: Map<string, string[]>;
  /** Names bound to `MAP[expr]` where MAP is not defined in this file. */
  readonly pendingMaps: Map<string, string>;
}

/** Extract every i18n key usage from one module's source. Never throws. */
export function extractI18nKeys(code: string): FileI18nUsage {
  const usage: FileI18nUsage = {
    exact: [],
    patterns: [],
    soft: [],
    propertyRefs: [],
    mapRefs: [],
    dynamicLines: [],
  };
  const bindings = collectBindings(code);

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

    const result = classifyKeyArgument(code, span.start, span.end, span.text, bindings);
    recordKeyArgument(result, call.line, usage);
  }

  return usage;
}

type KeyArgument =
  | { kind: 'resolved'; keys: string[] }
  | { kind: 'soft'; keys: string[] }
  | { kind: 'property'; name: string }
  | { kind: 'map'; name: string }
  | { kind: 'dynamic' };

/** Route a classified key argument into the matching usage sink. */
function recordKeyArgument(result: KeyArgument, line: number, usage: FileI18nUsage): void {
  switch (result.kind) {
    case 'resolved':
      for (const key of result.keys) {
        (key.includes('*') ? usage.patterns : usage.exact).push({ key, line });
      }
      return;
    case 'soft':
      for (const key of result.keys) {
        usage.soft.push({ key, line });
      }
      return;
    case 'property':
      usage.propertyRefs.push({ key: result.name, line });
      return;
    case 'map':
      usage.mapRefs.push({ key: result.name, line });
      return;
    default:
      usage.dynamicLines.push(line);
      return;
  }
}

/** Classify one call's key argument through the resolution ladder. */
function classifyKeyArgument(
  code: string,
  start: number,
  end: number,
  text: string,
  bindings: Bindings
): KeyArgument {
  const keys = resolveKeyExpression(code, start, end, bindings, MAX_DEPTH);
  if (keys !== null) {
    return { kind: 'resolved', keys };
  }
  const softKeys = resolveSoft(text, bindings);
  if (softKeys !== null) {
    return { kind: 'soft', keys: softKeys };
  }
  const property = PROPERTY_ACCESS.exec(text);
  if (property?.[2] !== undefined) {
    return { kind: 'property', name: property[2] };
  }
  const mapName = foreignMapName(text, bindings);
  if (mapName !== null) {
    return { kind: 'map', name: mapName };
  }
  return { kind: 'dynamic' };
}

/**
 * The name of a map defined OUTSIDE this file, when the argument is
 * `MAP[expr]` (directly or through a const binding). The scanner resolves it
 * plugin-wide against the file that defines the object literal.
 */
function foreignMapName(text: string, bindings: Bindings): string | null {
  const direct = MAP_INDEX.exec(text);
  if (direct?.[1] !== undefined) {
    return direct[1];
  }
  if (IDENTIFIER.test(text)) {
    return bindings.pendingMaps.get(text) ?? null;
  }
  return null;
}

/**
 * Every `<prop>: '<string literal>'` value in the source, for the properties
 * in `props`. The scanner calls this over EVERY plugin source to resolve
 * `t(x.<prop>)` references plugin-wide (the option table and the call site
 * often live in different files).
 */
export function collectPropertyLiterals(
  code: string,
  props: ReadonlySet<string>
): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const prop of props) {
    const re = new RegExp(`\\b${prop}\\s*:\\s*(?=['"\`])`, 'g');
    for (const match of code.matchAll(re)) {
      const value = parseLiteralAt(code, match.index + match[0].length);
      if (value === null || value.includes('*')) {
        continue;
      }
      const list = found.get(prop);
      if (list) {
        list.push(value);
      } else {
        found.set(prop, [value]);
      }
    }
  }
  return found;
}

/** Soft resolution: `IDENT` bound multiple times / `MAP[expr]` map values. */
function resolveSoft(text: string, bindings: Bindings): string[] | null {
  if (IDENTIFIER.test(text)) {
    const values = bindings.soft.get(text);
    return values === undefined ? null : [...values];
  }
  const mapIndex = MAP_INDEX.exec(text);
  if (mapIndex?.[1] !== undefined) {
    const values = bindings.objects.get(mapIndex[1]);
    return values === undefined || values.length === 0 ? null : [...values];
  }
  return null;
}

/**
 * File-level `const`/`let`/`var NAME = <expr>` bindings, resolved top-down so
 * a later binding may reference an earlier one. A name bound ONCE to a
 * resolvable string expression is exact-capable; bound more than once its
 * values demote to soft (`const key = ...` is a common name — a stray
 * non-i18n string under the same name must not become a missing-key error).
 */
function collectBindings(code: string): Bindings {
  const strings = new Map<string, string[]>();
  const soft = new Map<string, string[]>();
  const objects = new Map<string, string[]>();
  const pendingMaps = new Map<string, string>();

  const push = (map: Map<string, string[]>, name: string, values: readonly string[]) => {
    const list = map.get(name);
    if (list) {
      list.push(...values);
    } else {
      map.set(name, [...values]);
    }
  };
  const demote = (name: string, values: readonly string[]) => {
    const existing = strings.get(name);
    if (existing) {
      strings.delete(name);
      push(soft, name, existing);
    }
    push(soft, name, values);
  };

  for (const match of code.matchAll(BINDING)) {
    const name = match[1];
    if (name === undefined) {
      continue;
    }
    const start = match.index + match[0].length;
    if (code[start] === '{') {
      push(objects, name, collectObjectStringValues(code, start));
      continue;
    }
    const end = initializerEnd(code, start);
    if (end - start > MAX_INITIALIZER) {
      continue;
    }
    const mapIndex = MAP_INDEX.exec(code.slice(start, end).trim());
    if (mapIndex?.[1] !== undefined) {
      const values = objects.get(mapIndex[1]);
      if (values !== undefined && values.length > 0) {
        push(soft, name, values);
      } else {
        pendingMaps.set(name, mapIndex[1]);
      }
      continue;
    }
    const resolved = resolveKeyExpression(
      code,
      start,
      end,
      { strings, soft: new Map(), objects: new Map(), pendingMaps: new Map() },
      MAX_DEPTH
    );
    if (resolved === null || resolved.length === 0) {
      continue;
    }
    if (strings.has(name) || soft.has(name)) {
      demote(name, resolved);
    } else {
      push(strings, name, resolved);
    }
  }
  return { strings, soft, objects, pendingMaps };
}

/**
 * The string values of `const <name> = { ... }` object literals in this
 * source, for the map names in `names`. The scanner calls this over EVERY
 * plugin source to resolve `t(MAP[x])` references whose map lives in another
 * file.
 */
export function collectNamedObjectValues(
  code: string,
  names: ReadonlySet<string>
): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const name of names) {
    const re = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*(?::[^=;]*?)?=\\s*(?={)`, 'g');
    for (const match of code.matchAll(re)) {
      const values = collectObjectStringValues(code, match.index + match[0].length);
      if (values.length === 0) {
        continue;
      }
      const list = found.get(name);
      if (list) {
        list.push(...values);
      } else {
        found.set(name, [...values]);
      }
    }
  }
  return found;
}

/** Position after the initializer: the `;` / `,` / newline at bracket depth 0. */
function initializerEnd(code: string, start: number): number {
  let depth = 0;
  let i = start;
  const limit = Math.min(code.length, start + MAX_INITIALIZER + 1);
  while (i < limit) {
    const c = code[i];
    if (c === "'" || c === '"') {
      i = skipStringLiteral(code, i);
      continue;
    }
    if (c === '`') {
      i = skipTemplateLiteral(code, i);
      continue;
    }
    if (c === '(' || c === '[' || c === '{') {
      depth++;
    } else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) {
        return i;
      }
      depth--;
    } else if (depth === 0 && (c === ';' || c === ',' || c === '\n')) {
      return i;
    }
    i++;
  }
  return i;
}

/** String property values of the object literal opening at `start`. */
function collectObjectStringValues(code: string, start: number): string[] {
  const end = objectEnd(code, start);
  const values: string[] = [];
  for (const match of code.slice(start, end).matchAll(/:\s*(?=['"`])/g)) {
    const value = parseLiteralAt(code, start + match.index + match[0].length);
    if (value !== null && !value.includes('*')) {
      values.push(value);
    }
  }
  return values;
}

/** Position after the `}` matching the `{` at `start`. */
function objectEnd(code: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < code.length) {
    const c = code[i];
    if (c === "'" || c === '"') {
      i = skipStringLiteral(code, i);
      continue;
    }
    if (c === '`') {
      i = skipTemplateLiteral(code, i);
      continue;
    }
    if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) {
        return i + 1;
      }
    }
    i++;
  }
  return i;
}

/** Parse the string/template literal starting exactly at `start`, else null. */
function parseLiteralAt(code: string, start: number): string | null {
  const quote = code[start];
  if (quote === "'" || quote === '"') {
    const end = skipStringLiteral(code, start);
    return parseQuoted(code, start, end, quote);
  }
  if (quote === '`') {
    const end = skipTemplateLiteral(code, start);
    return parseTemplate(code, start, end);
  }
  return null;
}

/**
 * Resolve a key expression span to its possible keys (`*` marks unresolvable
 * segments). Returns null when nothing static can be said (a bare call, an
 * unknown identifier), which callers escalate to soft/property/dynamic.
 */
function resolveKeyExpression(
  code: string,
  rawStart: number,
  rawEnd: number,
  bindings: Bindings,
  depth: number
): string[] | null {
  if (depth <= 0) {
    return null;
  }
  const start = skipWhitespace(code, rawStart, rawEnd);
  const end = trimRightWhitespace(code, start, rawEnd);
  if (start >= end) {
    return null;
  }

  const shape = scanTopLevel(code, start, end);
  if (shape === null) {
    return null;
  }
  if (shape.ternary) {
    return resolveTernary(code, shape.ternary, end, bindings, depth);
  }
  if (shape.plusSplits.length > 0) {
    return resolveConcatenation(code, start, end, shape.plusSplits, bindings, depth);
  }
  if (shape.parenWrapped) {
    return resolveKeyExpression(code, start + 1, end - 1, bindings, depth - 1);
  }

  const text = code.slice(start, end);
  if (IDENTIFIER.test(text)) {
    const values = bindings.strings.get(text);
    return values === undefined ? null : [...values];
  }
  const literal = parseLiteralAt(code, start);
  if (literal !== null && skipLiteral(code, start) === end) {
    return [literal];
  }
  return null;
}

/** End position of the literal starting at `start` (caller checked the quote). */
function skipLiteral(code: string, start: number): number {
  return code[start] === '`' ? skipTemplateLiteral(code, start) : skipStringLiteral(code, start);
}

interface SpanShape {
  /** First top-level ternary `?` and its matching `:`, if any. */
  ternary?: { question: number; colon: number };
  /** Top-level `+` positions (only meaningful when no ternary). */
  plusSplits: number[];
  /** True when the whole span is one parenthesized group. */
  parenWrapped: boolean;
}

/**
 * One pass over the span at bracket depth 0, locating the structure the
 * resolver dispatches on. Returns null for malformed input (unbalanced
 * brackets), which the caller treats as dynamic.
 */
function scanTopLevel(code: string, start: number, end: number): SpanShape | null {
  const plusSplits: number[] = [];
  let bracketDepth = 0;
  let ternaryDepth = 0;
  let question = -1;
  let colon = -1;
  let i = start;
  while (i < end) {
    const c = code[i];
    if (c === "'" || c === '"') {
      i = skipStringLiteral(code, i);
      continue;
    }
    if (c === '`') {
      i = skipTemplateLiteral(code, i);
      continue;
    }
    if (c === '(' || c === '[' || c === '{') {
      bracketDepth++;
    } else if (c === ')' || c === ']' || c === '}') {
      bracketDepth--;
      if (bracketDepth < 0) {
        return null;
      }
    } else if (bracketDepth === 0) {
      const handled = scanOperator(code, i, {
        onQuestion: () => {
          if (question === -1) {
            question = i;
          } else if (colon === -1) {
            ternaryDepth++;
          }
        },
        onColon: () => {
          if (question !== -1 && colon === -1) {
            if (ternaryDepth === 0) {
              colon = i;
            } else {
              ternaryDepth--;
            }
          }
        },
        onPlus: () => {
          if (question === -1) {
            plusSplits.push(i);
          }
        },
      });
      if (handled > 0) {
        i += handled;
        continue;
      }
    }
    i++;
  }
  if (bracketDepth !== 0) {
    return null;
  }
  if (question !== -1) {
    return colon === -1
      ? null
      : { ternary: { question, colon }, plusSplits: [], parenWrapped: false };
  }
  const parenWrapped =
    plusSplits.length === 0 && code[start] === '(' && matchesWholeSpan(code, start, end);
  return { plusSplits, parenWrapped };
}

/**
 * Classify the operator at `i`, invoking the matching callback. Returns how
 * many characters to skip (0 when the char is not an operator of interest).
 * `?.` and `??` are skipped without callbacks: neither starts a ternary.
 */
function scanOperator(
  code: string,
  i: number,
  on: { onQuestion: () => void; onColon: () => void; onPlus: () => void }
): number {
  const c = code[i];
  if (c === '?') {
    const next = code[i + 1];
    if (next === '.' || next === '?') {
      return 2;
    }
    on.onQuestion();
    return 1;
  }
  if (c === ':') {
    on.onColon();
    return 1;
  }
  if (c === '+') {
    if (code[i + 1] === '+') {
      return 2; // `++` is not concatenation
    }
    on.onPlus();
    return 1;
  }
  return 0;
}

/** True when the `(` at `start` closes exactly at `end - 1`. */
function matchesWholeSpan(code: string, start: number, end: number): boolean {
  let depth = 0;
  let i = start;
  while (i < end) {
    const c = code[i];
    if (c === "'" || c === '"') {
      i = skipStringLiteral(code, i);
      continue;
    }
    if (c === '`') {
      i = skipTemplateLiteral(code, i);
      continue;
    }
    if (c === '(') {
      depth++;
    } else if (c === ')') {
      depth--;
      if (depth === 0) {
        return i === end - 1;
      }
    }
    i++;
  }
  return false;
}

/** Both branches of `cond ? a : b`, unioned. Either unresolvable → dynamic. */
function resolveTernary(
  code: string,
  ternary: { question: number; colon: number },
  end: number,
  bindings: Bindings,
  depth: number
): string[] | null {
  const whenTrue = resolveKeyExpression(
    code,
    ternary.question + 1,
    ternary.colon,
    bindings,
    depth - 1
  );
  const whenFalse = resolveKeyExpression(code, ternary.colon + 1, end, bindings, depth - 1);
  if (whenTrue === null || whenFalse === null) {
    return null;
  }
  const union = [...new Set([...whenTrue, ...whenFalse])];
  return union.length > MAX_CANDIDATES ? null : union;
}

/**
 * A `+` chain: every resolvable part contributes its value(s), every
 * unresolvable part contributes `*`. All-`*` results carry no information and
 * count as dynamic.
 */
function resolveConcatenation(
  code: string,
  start: number,
  end: number,
  plusSplits: readonly number[],
  bindings: Bindings,
  depth: number
): string[] | null {
  const bounds = [start, ...plusSplits.map((p) => p + 1)];
  let keys: string[] = [''];
  for (let i = 0; i < bounds.length; i++) {
    const partStart = bounds[i] ?? start;
    const partEnd = i < plusSplits.length ? (plusSplits[i] ?? end) : end;
    const part = resolveKeyExpression(code, partStart, partEnd, bindings, depth - 1) ?? ['*'];
    const next: string[] = [];
    for (const prefix of keys) {
      for (const value of part) {
        next.push(prefix + value);
      }
    }
    if (next.length > MAX_CANDIDATES) {
      return null;
    }
    keys = next;
  }
  const collapsed = keys.map((key) => key.replaceAll(/\*+/g, '*')).filter((key) => key !== '*');
  return collapsed.length === 0 ? null : collapsed;
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
