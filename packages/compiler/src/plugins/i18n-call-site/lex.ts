// ─── Character codes ────────────────────────────────────────────────────
export const CH_TAB = 0x09;
export const CH_LF = 0x0a;
export const CH_CR = 0x0d;
export const CH_SPACE = 0x20;
export const CH_DOLLAR = 0x24;
export const CH_SQUOTE = 0x27;
export const CH_DQUOTE = 0x22;
export const CH_LPAREN = 0x28;
export const CH_SLASH = 0x2f;
export const CH_LBRACE = 0x7b;
export const CH_RBRACE = 0x7d;
export const CH_BACKTICK = 0x60;

export function isIdentStart(ch: number): boolean {
  // a-z | A-Z | _ | $
  return (
    (ch >= 0x61 && ch <= 0x7a) || (ch >= 0x41 && ch <= 0x5a) || ch === 0x5f || ch === CH_DOLLAR
  );
}

export function isIdentPart(ch: number): boolean {
  return isIdentStart(ch) || (ch >= 0x30 && ch <= 0x39);
}

/**
 * Tokens that, when last seen, indicate the next `/` divides rather than
 * opening a regex. Keywords that imply regex are handled separately in
 * `REGEX_PRECEDING_KEYWORDS`.
 */
export const DIVISION_PRECEDING = new Set([')', ']', '}', '++', '--']);

export const REGEX_PRECEDING_KEYWORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'yield',
  'await',
  'case',
  'do',
  'else',
]);
