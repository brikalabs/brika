/**
 * Config template resolution.
 *
 * A block's string config fields may embed `{{ expr }}` expressions that are
 * resolved per input event, against the block's live scope:
 *   - `inputs.<port>`  the latest value pushed to that input port
 *   - `config.<key>`   another (non-templated) config value
 *
 * Dotted paths navigate into objects and arrays:
 * `{{ inputs.in.user.name }}`, `{{ inputs.items.0 }}`. An expression that
 * resolves to `undefined`/`null` renders the empty string; objects render as
 * JSON, primitives via `String`.
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
  return template.replace(EXPRESSION, (_match, rawPath: string) =>
    stringify(resolvePath(rawPath.trim(), scope))
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
// Path resolution
// ─────────────────────────────────────────────────────────────────────────────

function resolvePath(path: string, scope: TemplateScope): unknown {
  const segments = path
    .split('.')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return undefined;
  }

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
