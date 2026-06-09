/**
 * Config template resolution.
 *
 * A block's string config fields may embed `{{ expr }}` expressions that are
 * resolved per input event, against the block's live scope:
 *   - `inputs.<port>`  the latest value pushed to that input port
 *   - `config.<key>`   another (non-templated) config value
 *
 * Expressions are parsed (never eval'd):
 *   - paths: `{{ inputs.in.user.name }}`, `{{ inputs.items[0].id }}`,
 *     `{{ inputs.data["my key"] }}` (dot, index, and quoted-key segments)
 *   - fallback chains: `{{ inputs.in.title ?? config.title ?? "untitled" }}`
 *     takes the first operand that is not null/undefined; literals (quoted
 *     strings, numbers, true/false/null) are valid operands
 *
 * An expression that resolves to `undefined`/`null` renders the empty string;
 * objects render as JSON, primitives via `String`.
 *
 * This is the runtime half of the editor's variable picker: the UI's
 * `collectInputVariables` suggests `inputs.<port>` names and ConfigPanel
 * inserts `{{ ... }}`; here the reactive runtime resolves them. The two stay
 * in lockstep because both key off this block's own port ids.
 */

export interface TemplateScope {
  /** Latest value seen on each input port, keyed by port id. */
  inputs: Record<string, unknown>;
  /** Static (non-templated) config values, for cross-field references. */
  config: Record<string, unknown>;
}

// Matches a single `{{ expr }}` placeholder. The inner class `[^{}]` is disjoint
// from the `{}` delimiters and the `+` is greedy with no trailing optional, so the
// pattern is linear with no overlapping-quantifier backtracking (Sonar S5852,
// super-linear ReDoS). Surrounding whitespace is trimmed by the caller.
const EXPRESSION = /\{\{([^{}]+)\}\}/g;
/** Non-global twin used purely for presence checks (keeps `lastIndex` clean). */
const HAS_EXPRESSION = /\{\{[^{}]+\}\}/;

/** True when `value` contains at least one `{{ expr }}` placeholder. */
export function hasTemplate(value: string): boolean {
  return HAS_EXPRESSION.test(value);
}

/** Resolve every `{{ expr }}` in `template` against `scope`, returning a string. */
export function resolveTemplate(template: string, scope: TemplateScope): string {
  return template.replace(EXPRESSION, (_match, rawExpression: string) =>
    stringify(resolveExpression(rawExpression.trim(), scope))
  );
}

/**
 * Build a per-event config view: each string field that contains `{{ }}`
 * becomes a getter resolving against the live scope at read time; every other
 * field is the parsed value unchanged. When no field is templated the parsed
 * object is returned as-is, so non-templating blocks pay nothing.
 */
export function templatedConfigView(
  parsed: Record<string, unknown>,
  scope: TemplateScope
): Record<string, unknown> {
  const templatedKeys = Object.entries(parsed).filter(
    ([, value]) => typeof value === 'string' && hasTemplate(value)
  );
  if (templatedKeys.length === 0) {
    return parsed;
  }

  const view: Record<string, unknown> = { ...parsed };
  for (const [key, raw] of templatedKeys) {
    // `raw` is the captured template string for this field.
    Object.defineProperty(view, key, {
      get: () => resolveTemplate(String(raw), scope),
      enumerable: true,
      configurable: true,
    });
  }
  return view;
}

// ─────────────────────────────────────────────────────────────────────────────
// Expression parsing (paths, literals, ?? fallback chains)
// ─────────────────────────────────────────────────────────────────────────────

/** One parsed `{{ }}` operand: a scope path or a literal value. */
export type ExpressionOperand =
  | { kind: 'path'; segments: string[] }
  | { kind: 'literal'; value: string | number | boolean | null };

/**
 * Parse one expression into its `??`-separated operands. Returns null when the
 * expression is not valid (malformed path, unterminated string, ...), letting
 * callers distinguish "bad expression" from "path resolved to nothing".
 */
export function parseExpression(expression: string): ExpressionOperand[] | null {
  const parts = splitFallbacks(expression);
  const operands: ExpressionOperand[] = [];
  for (const part of parts) {
    const operand = parseOperand(part.trim());
    if (!operand) {
      return null;
    }
    operands.push(operand);
  }
  return operands.length > 0 ? operands : null;
}

/** Split on `??` (no string literal in scope contains it: quotes are atomic). */
function splitFallbacks(expression: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (let i = 0; i < expression.length; i++) {
    const ch = expression[i];
    if (quote) {
      current += ch;
      if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '?' && expression[i + 1] === '?') {
      parts.push(current);
      current = '';
      i++;
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

const NUMBER_LITERAL = /^-?\d+(\.\d+)?$/;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

function parseOperand(raw: string): ExpressionOperand | null {
  if (raw.length === 0) {
    return null;
  }
  // String literal
  const first = raw[0];
  if (first === "'" || first === '"') {
    if (raw.length < 2 || raw.at(-1) !== first) {
      return null;
    }
    return { kind: 'literal', value: raw.slice(1, -1) };
  }
  if (raw === 'true') {
    return { kind: 'literal', value: true };
  }
  if (raw === 'false') {
    return { kind: 'literal', value: false };
  }
  if (raw === 'null') {
    return { kind: 'literal', value: null };
  }
  if (NUMBER_LITERAL.test(raw)) {
    return { kind: 'literal', value: Number(raw) };
  }
  const segments = parsePathSegments(raw);
  return segments ? { kind: 'path', segments } : null;
}

/**
 * Parse `inputs.items[0]["my key"].name` into ['inputs','items','0','my key','name'].
 * Returns null on malformed syntax.
 */
function parsePathSegments(raw: string): string[] | null {
  const segments: string[] = [];
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '.') {
      i++;
      continue;
    }
    if (ch === '[') {
      const close = findBracketClose(raw, i);
      if (close === -1) {
        return null;
      }
      const inner = raw.slice(i + 1, close).trim();
      const key = parseBracketKey(inner);
      if (key === null) {
        return null;
      }
      segments.push(key);
      i = close + 1;
      continue;
    }
    // Bare identifier segment up to the next '.' or '['
    let end = i;
    while (end < raw.length && raw[end] !== '.' && raw[end] !== '[') {
      end++;
    }
    const ident = raw.slice(i, end).trim();
    // Identifiers and bare numeric indices (`items.0`, the historic syntax)
    if (!IDENTIFIER.test(ident) && !NUMBER_LITERAL.test(ident)) {
      return null;
    }
    segments.push(ident);
    i = end;
  }
  return segments.length > 0 ? segments : null;
}

function findBracketClose(raw: string, openIndex: number): number {
  let quote: string | null = null;
  for (let i = openIndex + 1; i < raw.length; i++) {
    const ch = raw[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === ']') {
      return i;
    }
  }
  return -1;
}

function parseBracketKey(inner: string): string | null {
  if (inner.length === 0) {
    return null;
  }
  const first = inner[0];
  if (first === "'" || first === '"') {
    if (inner.length < 2 || inner.at(-1) !== first) {
      return null;
    }
    return inner.slice(1, -1);
  }
  return NUMBER_LITERAL.test(inner) ? inner : null;
}

/** Resolve a parsed-or-raw expression: first non-nullish operand wins. */
function resolveExpression(expression: string, scope: TemplateScope): unknown {
  const operands = parseExpression(expression);
  if (!operands) {
    return undefined;
  }
  for (const operand of operands) {
    const value =
      operand.kind === 'literal' ? operand.value : resolveSegments(operand.segments, scope);
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

function resolveSegments(segments: string[], scope: TemplateScope): unknown {
  const [root, ...rest] = segments;
  let current = rootScope(root, scope);
  for (const segment of rest) {
    current = navigate(current, segment);
    if (current === undefined) {
      return undefined;
    }
  }
  return current;
}

/** Map a root segment to its scope namespace; unknown roots resolve to nothing. */
function rootScope(root: string | undefined, scope: TemplateScope): unknown {
  if (root === 'inputs') {
    return scope.inputs;
  }
  if (root === 'config') {
    return scope.config;
  }
  return undefined;
}

/** Read `key` off `current` (object property or array index) without casts. */
function navigate(current: unknown, key: string): unknown {
  if (current === null || current === undefined) {
    return undefined;
  }
  if (Array.isArray(current)) {
    const index = Number(key);
    return Number.isInteger(index) ? current[index] : undefined;
  }
  if (typeof current === 'object') {
    return Reflect.get(current, key);
  }
  return undefined;
}

/** Render a resolved value as a string for embedding back into the template. */
function stringify(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    // Unserializable (e.g. a circular structure) renders empty, like a missing path.
    return '';
  }
}
