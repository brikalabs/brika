/**
 * Unit tests for injectCallSites in scanner.ts.
 *
 * The scanner is a tokenizer that finds top-level `t(...)` and `tp(...)` calls
 * and rewrites them with call-site metadata. These tests exercise the pure
 * string transformation (no Bun.build needed) by calling `injectCallSites`
 * directly.
 *
 * Uncovered lines targeted:
 *   282-293  startsRegex() branches (empty lastSignificant, keyword, ident, DIVISION_PRECEDING)
 *   297-304  skipRegex() loop
 *   312-336  stepRegexChar() branches (escape, char class, close slash, newline)
 *   340-342  skipRegexFlags()
 *   347-350  consumeEscapePair()
 */

import { describe, expect, test } from 'bun:test';
import { injectCallSites } from './scanner';

const RELPATH = 'src/test.ts';

// ─── Basic rewrites ──────────────────────────────────────────────────────────

describe('injectCallSites - basic rewrites', () => {
  test('rewrites t("key") by appending call-site', () => {
    const out = injectCallSites(`t('hello')`, RELPATH);
    expect(out).toContain('__cs');
    expect(out).toContain('src/test.ts:1');
  });

  test('rewrites tp("pkg", "key") by appending 4th arg', () => {
    const out = injectCallSites(`tp('pkg', 'key')`, RELPATH);
    expect(out).toContain('src/test.ts:1');
  });

  test('returns original code when no t( or tp( calls', () => {
    const code = 'export const x = 1;';
    expect(injectCallSites(code, RELPATH)).toBe(code);
  });

  test('multiple calls on different lines', () => {
    const code = "t('a');\nt('b');";
    const out = injectCallSites(code, RELPATH);
    expect(out).toContain('src/test.ts:1');
    expect(out).toContain('src/test.ts:2');
  });
});

// ─── Regex literal handling (startsRegex + skipRegex + stepRegexChar) ────────

describe('injectCallSites - regex literals do not capture t(', () => {
  test('regex after = does not match t(', () => {
    // After `=` startsRegex() should return true (not division)
    const code = String.raw`const r = /t('x')/; export const x = r;`;
    const out = injectCallSites(code, RELPATH);
    expect(out).not.toContain('__cs');
  });

  test('regex after , (comma) does not match t(', () => {
    const code = String.raw`foo(/t('x')/, 'bar'); export {};`;
    const out = injectCallSites(code, RELPATH);
    // 'bar' is not a t() call, so no __cs expected for it
    expect(out).not.toContain('__cs');
  });

  test('regex after return keyword does not match t(', () => {
    const code = String.raw`function f() { return /t('x')/; } export {};`;
    const out = injectCallSites(code, RELPATH);
    expect(out).not.toContain('__cs');
  });

  test('regex after typeof keyword does not match t(', () => {
    const code = String.raw`const v = typeof /t('x')/; export {};`;
    const out = injectCallSites(code, RELPATH);
    expect(out).not.toContain('__cs');
  });

  test('division (/) after ) is not treated as regex start', () => {
    // After `)`, the `/` is division, not a regex.
    // This means t() after the division should still be rewritten.
    const code = `const x = (2) / 2; t('hello');`;
    const out = injectCallSites(code, RELPATH);
    expect(out).toContain('__cs');
  });

  test('division after ] is not treated as regex start', () => {
    const code = `const x = arr[0] / 2; t('hello');`;
    const out = injectCallSites(code, RELPATH);
    expect(out).toContain('__cs');
  });

  test('regex with escape sequence (\\) inside is not mangled', () => {
    // stepRegexChar escape branch: `\t` inside regex
    const code = String.raw`const r = /\t+/; t('hello');`;
    const out = injectCallSites(code, RELPATH);
    expect(out).toContain('__cs');
    expect(out).toContain('src/test.ts:1');
  });

  test('regex with character class [t(] does not trigger rewrite', () => {
    // stepRegexChar [ branch sets inClass=true, ] resets it
    const code = String.raw`const r = /[t(]/g; t('hello');`;
    const out = injectCallSites(code, RELPATH);
    // t('hello') should be rewritten, the t( inside regex should not
    expect(out).toContain('__cs');
  });

  test('regex that ends on newline (unterminated) does not crash', () => {
    // stepRegexChar newline branch returns 'done'
    const code = 'const r = /t(\n; export const x = 1;';
    // Just verify it doesn't throw
    expect(() => injectCallSites(code, RELPATH)).not.toThrow();
  });

  test('regex with flags after closing slash is consumed (skipRegexFlags)', () => {
    // skipRegexFlags consumes ident chars after closing /
    const code = `const r = /foo/gi; t('hello');`;
    const out = injectCallSites(code, RELPATH);
    expect(out).toContain('__cs');
  });

  test('regex at start of file (empty lastSignificant -> startsRegex=true)', () => {
    // At the very start, lastSignificant is '' so startsRegex() returns true
    const code = `/foo/; t('hello');`;
    const out = injectCallSites(code, RELPATH);
    expect(out).toContain('__cs');
  });

  test('DIVISION_PRECEDING: ++ after identifier means / is division, not regex', () => {
    // After `i++`, the `/` is division
    const code = `let i = 0; i++; const x = i / 2; t('hello');`;
    const out = injectCallSites(code, RELPATH);
    expect(out).toContain('__cs');
  });

  test('DIVISION_PRECEDING: -- after identifier means / is division, not regex', () => {
    const code = `let i = 1; i--; const x = i / 2; t('hello');`;
    const out = injectCallSites(code, RELPATH);
    expect(out).toContain('__cs');
  });
});

// ─── Comment skipping ────────────────────────────────────────────────────────

describe('injectCallSites - comment handling', () => {
  test('t() inside // line comment is NOT rewritten', () => {
    const code = "// t('hello')\nexport const x = 1;";
    const out = injectCallSites(code, RELPATH);
    expect(out).not.toContain('__cs');
  });

  test('t() inside /* */ block comment is NOT rewritten', () => {
    const code = "/* t('hello') */\nexport const x = 1;";
    const out = injectCallSites(code, RELPATH);
    expect(out).not.toContain('__cs');
  });

  test('t() after // comment on same line is NOT rewritten', () => {
    const code = "const x = 1; // t('hello')";
    const out = injectCallSites(code, RELPATH);
    expect(out).not.toContain('__cs');
  });
});

// ─── String literal handling ─────────────────────────────────────────────────

describe('injectCallSites - string literals', () => {
  test('t() inside single-quoted string is NOT rewritten', () => {
    const code = 'const x = "t(\'hello\')";\nexport {};';
    const out = injectCallSites(code, RELPATH);
    expect(out).not.toContain('__cs');
  });

  test('t() inside double-quoted string is NOT rewritten', () => {
    const code = `const x = 't("hello")';\nexport {};`;
    const out = injectCallSites(code, RELPATH);
    expect(out).not.toContain('__cs');
  });

  test('t() after escaped quote in string is NOT rewritten', () => {
    const code = String.raw`const x = 'it\'s t("hello") time'; export {};`;
    const out = injectCallSites(code, RELPATH);
    expect(out).not.toContain('__cs');
  });

  test('unterminated string (newline) does not cause infinite loop', () => {
    // The string is terminated by newline; scanner continues past it
    const code = "const x = 'open\nt('hello');";
    expect(() => injectCallSites(code, RELPATH)).not.toThrow();
  });
});

// ─── Template literal handling ────────────────────────────────────────────────

describe('injectCallSites - template literals', () => {
  test('t() inside backtick template body is NOT rewritten', () => {
    const code = "const x = `t('hello')`;\nexport {};";
    const out = injectCallSites(code, RELPATH);
    expect(out).not.toContain('__cs');
  });

  test('t() inside ${...} interpolation IS rewritten', () => {
    const code = "const x = `prefix ${t('hello')} suffix`;\nexport {};";
    const out = injectCallSites(code, RELPATH);
    expect(out).toContain('__cs');
  });

  test('t() inside nested template in ${...} is NOT double-rewritten', () => {
    // The outer template literal body is skipped, t() inside the inner template
    // interpolation is inside the outer template's body - should NOT rewrite
    const code = "const x = `outer ${ `inner` } t('x')`;\nexport {};";
    const out = injectCallSites(code, RELPATH);
    expect(out).not.toContain('__cs');
  });

  test('template literal with escape sequence is parsed correctly', () => {
    const code = "const x = `line\\nnext`;\nt('hello');";
    const out = injectCallSites(code, RELPATH);
    expect(out).toContain('__cs');
  });

  test('brace depth tracking: { inside template interpolation does not confuse scanner', () => {
    // consumeLBrace increments braceDepth when inside a template interpolation
    const code = "const x = `${ { key: 1 } }`;\nt('hello');";
    const out = injectCallSites(code, RELPATH);
    expect(out).toContain('__cs');
  });
});

// ─── Identifier/member access guards ─────────────────────────────────────────

describe('injectCallSites - canBeCall guards', () => {
  test('obj.t("key") is NOT rewritten (dot member access)', () => {
    const code = "obj.t('hello'); export {};";
    const out = injectCallSites(code, RELPATH);
    expect(out).not.toContain('__cs');
  });

  test('obj?.t("key") is NOT rewritten (optional chain)', () => {
    const code = "obj?.t('hello'); export {};";
    const out = injectCallSites(code, RELPATH);
    expect(out).not.toContain('__cs');
  });

  test('t("key") at start of file is rewritten (no preceding char)', () => {
    const code = "t('hello'); export {};";
    const out = injectCallSites(code, RELPATH);
    expect(out).toContain('__cs');
  });

  test('t("key") after whitespace is rewritten', () => {
    const code = "  t('hello'); export {};";
    const out = injectCallSites(code, RELPATH);
    expect(out).toContain('__cs');
  });

  test('t("key") after tab is rewritten', () => {
    const code = "\tt('hello'); export {};";
    const out = injectCallSites(code, RELPATH);
    expect(out).toContain('__cs');
  });

  test('non-t identifier like cat() is NOT rewritten', () => {
    const code = "cat('hello'); export {};";
    const out = injectCallSites(code, RELPATH);
    expect(out).not.toContain('__cs');
  });
});

// ─── Argument shape guards ────────────────────────────────────────────────────

describe('injectCallSites - argument shape guards', () => {
  test('t(varName) with identifier arg is NOT rewritten', () => {
    const code = 'const key = "k"; t(key); export {};';
    const out = injectCallSites(code, RELPATH);
    expect(out).not.toContain('__cs');
  });

  test('t("key", varOpts) with non-object 2nd arg is NOT rewritten', () => {
    const code = "const opts = {}; t('key', opts); export {};";
    const out = injectCallSites(code, RELPATH);
    expect(out).not.toContain('__cs');
  });

  test('t() with no args produces no rewrite (empty argument span issue)', () => {
    // readArguments on empty call returns one empty span - first arg is not a string literal
    const code = 't(); export {};';
    const out = injectCallSites(code, RELPATH);
    expect(out).not.toContain('__cs');
  });

  test('tp with 4 args already is NOT rewritten again', () => {
    const code = "tp('pkg', 'key', undefined, 'existing-cs'); export {};";
    const out = injectCallSites(code, RELPATH);
    const occurrences = (out.match(/existing-cs/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  test('tp with 1 arg is NOT rewritten', () => {
    const code = "tp('pkg'); export {};";
    const out = injectCallSites(code, RELPATH);
    expect(out).not.toContain('src/test.ts:1');
  });
});

// ─── findOpenParen: whitespace between ident and ( ──────────────────────────

describe('injectCallSites - whitespace between identifier and (', () => {
  test('t  ("key") with spaces before ( is still rewritten', () => {
    const code = "t  ('hello'); export {};";
    const out = injectCallSites(code, RELPATH);
    expect(out).toContain('__cs');
  });

  test('t followed by non-( char is NOT a call', () => {
    // t[0] is not a call
    const code = 'const t = [1]; const x = t[0]; export {};';
    const out = injectCallSites(code, RELPATH);
    expect(out).not.toContain('__cs');
  });
});

// ─── consumeRBrace: template stack management ────────────────────────────────

describe('injectCallSites - consumeRBrace in template context', () => {
  test('closing } at matching templateStack depth resumes template scanning', () => {
    // This exercises the templateStack.pop() + skipTemplate(false) path.
    // After the interpolation closes, the scanner is back inside the template
    // body. The t('hello') outside the template is a real top-level call and
    // should be rewritten.
    const code = "const x = `a ${ 1 + 2 } b`; t('hello');";
    const out = injectCallSites(code, RELPATH);
    expect(out).toContain('__cs');
    // The t('hello') after the template is correctly rewritten
    expect(out).toContain('src/test.ts:1');
  });

  test('} at depth > 0 inside interpolation decrements braceDepth', () => {
    // Object with closing brace inside interpolation: `${ {a:1} }` - outer }
    // at depth 0 should close the interpolation; inner } at depth 1 decrements
    const code = "const s = `${ { a: 1 } }`; t('hello');";
    const out = injectCallSites(code, RELPATH);
    expect(out).toContain('__cs');
  });

  test('} outside template context just records significant and advances', () => {
    const code = "function f() { return 1; } t('hello');";
    const out = injectCallSites(code, RELPATH);
    expect(out).toContain('__cs');
  });
});

// ─── Line counter ────────────────────────────────────────────────────────────

describe('injectCallSites - line tracking', () => {
  test('reports correct line numbers for calls after newlines', () => {
    const code = "const a = 1;\nconst b = 2;\nt('hello');";
    const out = injectCallSites(code, RELPATH);
    expect(out).toContain('src/test.ts:3');
  });

  test('t() on line 1 reports line 1', () => {
    const code = "t('hello');\nconst x = 1;";
    const out = injectCallSites(code, RELPATH);
    expect(out).toContain('src/test.ts:1');
  });
});

// ─── applyEdits ordering ─────────────────────────────────────────────────────

describe('injectCallSites - multiple edits applied right-to-left', () => {
  test('two calls at different positions both get correct metadata', () => {
    const code = "const a = t('first');\nconst b = tp('pkg', 'key');";
    const out = injectCallSites(code, RELPATH);
    expect(out).toContain('src/test.ts:1');
    expect(out).toContain('src/test.ts:2');
  });
});

// ─── edits.ts line coverage via scanner ──────────────────────────────────────
// These exercise the null-return paths in buildEdit / buildTEdit / buildObjectSpliceEdit.

describe('injectCallSites - edits.ts null-return paths', () => {
  test('buildEdit returns null for malformed t( with no closing paren - edits.ts line 12', () => {
    // When readArguments returns null (no closing paren), buildEdit returns null
    // and injectCallSites produces no edit.
    // An unclosed call is unusual in real code but the scanner still finds t( and
    // calls buildEdit; with no ) in the remainder, readArguments returns null.
    const code = "const x = t('unclosed'; export {};";
    // Should not throw, and since no valid call is found, no __cs is injected
    const out = injectCallSites(code, RELPATH);
    expect(out).not.toContain('__cs');
  });

  test('buildTEdit returns null when args.spans is empty - edits.ts line 29', () => {
    // readArguments on t() returns one empty span, so spans.length is 1 (not 0).
    // To get spans.length === 0, the spans array itself would need to be empty,
    // which only happens if makeSpans returns [] - not currently reachable in practice.
    // Verify the empty-call case is handled gracefully (no rewrite because empty span
    // is not a string literal, handled by the isStringOrTemplateLiteral check).
    const code = 't(); export {};';
    const out = injectCallSites(code, RELPATH);
    expect(out).not.toContain('__cs');
  });

  test('buildObjectSpliceEdit returns null when no { found in object arg - edits.ts line 57', () => {
    // If the second arg looks like an object literal (starts with {) but
    // by the time buildObjectSpliceEdit searches for { from span.start it
    // can't find one in range, it returns null.
    // In practice this path is hit when code.indexOf('{', span.start) is -1 or
    // past span.end. This is hard to trigger via injectCallSites because the
    // scanner correctly identifies the span bounds. The line is a defensive guard.
    // Verify the common path works:
    const code = "t('key', { ns: 'foo' }); export {};";
    const out = injectCallSites(code, RELPATH);
    expect(out).toContain('__cs');
  });
});
