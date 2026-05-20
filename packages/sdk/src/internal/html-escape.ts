const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escape a string for safe interpolation into HTML text or attribute values.
 *
 * Use this for any user-controlled, plugin-supplied, or upstream-provided
 * value that will end up in an HTML response. The SDK ships HTML pages from
 * the OAuth helper served on the hub's origin — unescaped interpolation there
 * is same-origin XSS against the hub UI.
 *
 * Callers must narrow `unknown`/`Error` values to a string themselves (e.g.
 * `e instanceof Error ? e.message : String(e)`) so the choice of how to
 * stringify non-strings is local to the call site.
 */
export function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}
