/**
 * `evaluate(code)` — runs a string of JS inside a controlled scope and
 * returns the result. Used by the REPL input at the bottom of the
 * debug overlay.
 *
 * The injected code runs as the body of an async function, so users
 * can `await` freely:
 *
 *   > await fetch('https://api.example.com').then(r => r.json())
 *
 * A bare expression returns its value; multi-statement snippets
 * should `return` explicitly (mirrors the Node REPL's `.editor` mode).
 * If the snippet doesn't contain `return`, we wrap it once so single
 * expressions still produce a value implicitly.
 *
 * Safety: this function uses `new Function(...)` — the classic JS code-
 * execution sink. It is guarded so it cannot run when:
 *   - `NODE_ENV === 'production'`, or
 *   - the host explicitly opts out by setting `BRIKA_DISABLE_REPL=1`.
 * The `<DebugProvider>` component is also opt-in (`enabled` prop, default
 * `true` only in dev), so production bundles never reach this path.
 */

export interface EvaluateResult {
  readonly ok: boolean;
  readonly value: unknown;
}

const DISABLED_RESULT: EvaluateResult = {
  ok: false,
  value: new Error('REPL is disabled in this environment'),
};

function isReplDisabled(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.BRIKA_DISABLE_REPL === '1';
}

export async function evaluate(code: string): Promise<EvaluateResult> {
  if (isReplDisabled()) {
    return DISABLED_RESULT;
  }
  const wrapped = needsExplicitReturn(code) ? `return (${code});` : code;
  // The Function constructor is the whole point of a REPL. The guard
  // above keeps this path closed in production; in dev the operator
  // who opened the overlay is the same one typing the expression.
  // eslint-disable-next-line no-new-func
  const fn = new Function(`return (async () => { ${wrapped} })()`);
  try {
    const result: unknown = fn();
    const value = result instanceof Promise ? await result : result;
    return { ok: true, value };
  } catch (err) {
    return { ok: false, value: err };
  }
}

/** True when `code` is a single expression (no `;`, no `return`, no
 *  block statement at the top level). We wrap those in `return (…)`
 *  so `1+1` produces `2` rather than `undefined`. Anything richer
 *  must `return` explicitly. */
function needsExplicitReturn(code: string): boolean {
  const trimmed = code.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (trimmed.includes(';')) {
    return false;
  }
  if (/^\s*(return|const|let|var|if|for|while|function|class|throw|try|switch)\b/.test(trimmed)) {
    return false;
  }
  if (trimmed.startsWith('{')) {
    return false;
  }
  return true;
}
