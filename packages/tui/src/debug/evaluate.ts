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
 */

export interface EvaluateResult {
  readonly ok: boolean;
  readonly value: unknown;
}

export async function evaluate(code: string): Promise<EvaluateResult> {
  const wrapped = needsExplicitReturn(code) ? `return (${code});` : code;
  // We construct an async function and call it. Errors propagate
  // through the returned promise so the caller can format them.
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
