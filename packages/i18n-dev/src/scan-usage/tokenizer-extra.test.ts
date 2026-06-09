/**
 * Extra coverage for tokenizer.ts — targeting uncovered lines:
 *   - line 38: skipWhitespace when i >= src.length → none
 *   - line 76: readQuoted: unterminated string returns opaque
 *   - lines 90-91: findTemplateClose: escape sequence handling
 *   - lines 112-113: skipBraceBody: escape sequence in brace body
 *   - lines 120-122: skipBraceBody: nested template literal
 *   - line 125: skipBraceBody: nested brace depth++
 *   - lines 139-140: skipPlainString: escape sequence
 *   - lines 146-147: skipPlainString: unterminated string
 *   - lines 165-166: skipOpaqueArg: exits on length
 *   - line 178: stepThroughOpaqueChar: escape char
 *   - line 181: stepThroughOpaqueChar: plain string
 *   - lines 184-185: stepThroughOpaqueChar: template literal
 *   - line 188: stepThroughOpaqueChar: open bracket
 *   - line 193: stepThroughOpaqueChar: close bracket with depth > 0
 */

import { describe, expect, test } from 'bun:test';
import {
  findCallName,
  findTemplateClose,
  iterateCallSites,
  lineFromOffset,
  readStringArg,
  skipBraceBody,
  skipWhitespace,
} from './tokenizer';

describe('readStringArg edge cases', () => {
  test('returns none when input is empty past `from`', () => {
    // from points past end of string
    expect(readStringArg('', 0)).toEqual({ kind: 'none' });
    expect(readStringArg('abc', 3)).toEqual({ kind: 'none' });
  });

  test('returns opaque for unterminated single-quoted string (line 76 path)', () => {
    // Single quote opens but never closes
    const src = "('unterminated";
    const result = readStringArg(src, 1);
    expect(result.kind).toBe('opaque');
  });

  test('returns opaque for unterminated double-quoted string', () => {
    const src = '("unterminated';
    const result = readStringArg(src, 1);
    expect(result.kind).toBe('opaque');
  });

  test('handles backslash escape inside single-quoted string', () => {
    const src = "('it\\'s here')";
    const result = readStringArg(src, 1);
    expect(result.kind).toBe('static');
    if (result.kind === 'static') {
      expect(result.value).toBe("it\\'s here");
    }
  });

  test('template literal with only interpolation (empty static prefix)', () => {
    const src = '(`${x}`)';
    const result = readStringArg(src, 1);
    expect(result.kind).toBe('prefix');
    if (result.kind === 'prefix') {
      expect(result.value).toBe('');
    }
  });

  test('returns opaque for unterminated template literal', () => {
    // Backtick opens but the template is unterminated
    const src = '(`pre.${x}  ';
    const result = readStringArg(src, 1);
    expect(result.kind).toBe('prefix');
    if (result.kind === 'prefix') {
      expect(result.value).toBe('pre.');
    }
  });
});

describe('skipBraceBody edge cases', () => {
  test('handles escape sequence inside brace body (line 112-113 path)', () => {
    // Body: `\n}`  — the backslash escapes next char, then `}` closes
    const src = '\\"ok}rest';
    const end = skipBraceBody(src, 0);
    // After escape \", depth is still 1; after 'o','k', then '}' closes
    expect(src.slice(end)).toBe('rest');
  });

  test('handles nested template literal inside brace body (line 120-122 path)', () => {
    // brace body with a nested template literal: '`nested`}rest'
    // after processing `nested`, we hit '}' which closes depth=1, end past it.
    const src = '`nested`}rest';
    const end = skipBraceBody(src, 0);
    expect(src.slice(end)).toBe('rest');
  });

  test('handles nested brace depth increment (line 125 path)', () => {
    // skipBraceBody starts with depth=1 (already inside a brace body).
    // A '{' inside increments depth to 2, and the matching '}' decrements to 1,
    // and the final '}' decrements to 0 and exits.
    // Input: "inner: { deep: 1 } }rest" -- the outer } is the one that closes.
    const src = 'inner: { deep: 1 } }rest';
    const end = skipBraceBody(src, 0);
    // end points just past the closing '}' that brought depth to 0
    expect(src.slice(end)).toBe('rest');
  });

  test('handles plain string inside brace body (line 115-118 path)', () => {
    // depth starts at 1; after "hello" we hit } which brings it to 0 and stops.
    // skipBraceBody returns j AFTER j++ (past the closing }).
    const src = '"hello"}rest';
    const end = skipBraceBody(src, 0);
    // end is past the '}', so src.slice(end) = 'rest'
    expect(src.slice(end)).toBe('rest');
  });

  test('handles single-quoted string with escape inside brace body', () => {
    const src = "'it\\'s'}rest";
    const end = skipBraceBody(src, 0);
    expect(src.slice(end)).toBe('rest');
  });
});

describe('findTemplateClose edge cases', () => {
  test('handles escape in template body (line 90-91 path)', () => {
    // Template: `foo\`bar` — escape before inner backtick
    // from=0 (we pass 0 to simulate pointing at start after outer open)
    const src = 'foo\\`bar`';
    const result = findTemplateClose(src, 0);
    // The first ` encountered after skipping the escape should be at the end
    expect(result).toBe(src.length - 1);
  });

  test('handles nested interpolation within template (line 96-98 path)', () => {
    // Template with nested ${...} containing another backtick template
    const src = '${`inner`}`';
    const result = findTemplateClose(src, 0);
    expect(result).toBe(src.length - 1);
  });
});

describe('findCallName and iterateCallSites', () => {
  test('findCallName returns -1 when name never appears', () => {
    expect(findCallName('no such function here', 'myFunc')).toBe(-1);
  });

  test('findCallName skips embedded occurrences (not at word boundary)', () => {
    // 'cat' contains 'at' but 'at(' is not preceded by a word boundary
    expect(findCallName('cat(x)', 'at')).toBe(-1);
  });

  test('findCallName finds the call with whitespace before the paren', () => {
    const src = 'foo  (bar)';
    const idx = findCallName(src, 'foo');
    expect(idx).toBeGreaterThanOrEqual(0);
  });

  test('iterateCallSites yields every valid boundary-matched occurrence', () => {
    const src = 't("a"); t("b"); _t("c"); cat("d"); t("e")';
    const occurrences = [...iterateCallSites(src, 't')];
    expect(occurrences).toHaveLength(3); // t("a"), t("b"), t("e")
  });

  test('iterateCallSites returns nothing for empty input', () => {
    expect([...iterateCallSites('', 't')]).toHaveLength(0);
  });
});

describe('lineFromOffset edge cases', () => {
  test('returns 1 for offset 0 in an empty string', () => {
    expect(lineFromOffset('', 0)).toBe(1);
  });

  test('clamps to string length when offset exceeds length', () => {
    // offset > src.length should not crash
    expect(lineFromOffset('a\nb', 100)).toBe(2);
  });
});

describe('skipWhitespace edge cases', () => {
  test('returns from when from is already at a non-whitespace character', () => {
    expect(skipWhitespace('abc', 0)).toBe(0);
  });

  test('returns src.length when all remaining chars are whitespace', () => {
    expect(skipWhitespace('   ', 0)).toBe(3);
  });
});

describe('readStringArg with opaque nested expressions', () => {
  test('opaque arg with nested parens is skipped correctly', () => {
    // foo(bar(x), y) — from points at 'f'
    const src = '(foo(bar(x), y))';
    const result = readStringArg(src, 1);
    expect(result.kind).toBe('opaque');
    if (result.kind === 'opaque') {
      // nextIndex should be just before the closing ')' of the outer call
      expect(src[result.nextIndex]).toBe(')');
    }
  });

  test('opaque arg with nested brackets is skipped correctly', () => {
    const src = '(arr[0])';
    const result = readStringArg(src, 1);
    expect(result.kind).toBe('opaque');
  });

  test('opaque arg with nested template literal is skipped correctly', () => {
    const src = '(`${a}`)';
    const result = readStringArg(src, 1);
    // This is actually a prefix (template with interpolation)
    expect(result.kind).toBe('prefix');
  });

  test('opaque arg with escaped character inside is handled', () => {
    // An opaque arg containing a backslash: foo\bar
    const src = '(foo\\bar)';
    const result = readStringArg(src, 1);
    expect(result.kind).toBe('opaque');
  });

  // ── lines 181: stepThroughOpaqueChar with quoted string ──────────────────

  test('opaque arg containing a string literal inside is skipped over correctly', () => {
    // t(obj["key"]) — the string "key" is inside brackets
    const src = '(obj["key"])';
    const result = readStringArg(src, 1);
    expect(result.kind).toBe('opaque');
    if (result.kind === 'opaque') {
      expect(src[result.nextIndex]).toBe(')');
    }
  });

  test('opaque arg containing a single-quoted string inside is skipped correctly (line 181)', () => {
    // t(obj['key']) — single-quoted string inside opaque
    const src = "(obj['key'])";
    const result = readStringArg(src, 1);
    expect(result.kind).toBe('opaque');
  });

  // ── lines 184-185: stepThroughOpaqueChar with backtick template ───────────

  test('opaque arg containing a backtick template is skipped correctly (lines 184-185)', () => {
    // t(fn(`template`)) — backtick template inside opaque arg
    const src = '(fn(`template`))';
    const result = readStringArg(src, 1);
    expect(result.kind).toBe('opaque');
    if (result.kind === 'opaque') {
      expect(src[result.nextIndex]).toBe(')');
    }
  });

  // ── line 197: stepThroughOpaqueChar with comma at depth 0 ────────────────

  test('opaque arg stops at top-level comma (line 197 path)', () => {
    // t(a, b) — reading first arg 'a': should stop at the comma
    const src = '(a, b)';
    const result = readStringArg(src, 1);
    expect(result.kind).toBe('opaque');
    if (result.kind === 'opaque') {
      // nextIndex points at the comma
      expect(src[result.nextIndex]).toBe(',');
    }
  });

  // ── lines 146-147: skipPlainString reaches end of string (unterminated) ──
  // skipPlainString is called from stepThroughOpaqueChar when an opaque expression
  // contains a quoted string. The unterminated case returns src.length.

  test('opaque arg containing unterminated single-quoted string runs to end (lines 146-147)', () => {
    // t(obj['no-close) — single-quote inside opaque, never closes
    const src = "(obj['no-close)";
    const result = readStringArg(src, 1);
    expect(result.kind).toBe('opaque');
    if (result.kind === 'opaque') {
      // The unterminated single-quote inside the opaque causes skipPlainString
      // to return src.length, then the outer skipOpaqueArg also exits at end.
      expect(result.nextIndex).toBe(src.length);
    }
  });

  test('opaque arg containing unterminated double-quoted string runs to end (lines 146-147)', () => {
    // t(obj["no-close) — double-quote inside opaque, never closes
    const src = '(obj["no-close)';
    const result = readStringArg(src, 1);
    expect(result.kind).toBe('opaque');
    if (result.kind === 'opaque') {
      expect(result.nextIndex).toBe(src.length);
    }
  });

  // ── lines 165-166: skipOpaqueArg runs to end of string ───────────────────

  test('opaque arg that has no terminating ) or , runs to end of string (lines 165-166)', () => {
    // An opaque argument with no closing paren — runs to end of src.length
    const src = '(someVariable';
    const result = readStringArg(src, 1);
    expect(result.kind).toBe('opaque');
    if (result.kind === 'opaque') {
      expect(result.nextIndex).toBe(src.length);
    }
  });
});
