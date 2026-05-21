import { describe, expect, test } from 'bun:test';
import {
  findTemplateClose,
  lineFromOffset,
  readStringArg,
  skipBraceBody,
  skipWhitespace,
} from './tokenizer';

describe('readStringArg', () => {
  test("returns 'none' on empty parens", () => {
    expect(readStringArg('()', 1)).toEqual({ kind: 'none' });
  });

  test("returns 'static' for single-quoted literal with nextIndex past closing quote", () => {
    const src = "('foo')";
    const arg = readStringArg(src, 1);
    expect(arg).toEqual({ kind: 'static', value: 'foo', nextIndex: 6 });
  });

  test("returns 'static' for double-quoted literal", () => {
    const src = '("bar")';
    expect(readStringArg(src, 1)).toEqual({ kind: 'static', value: 'bar', nextIndex: 6 });
  });

  test("returns 'static' for plain backtick literal with no interpolation", () => {
    const src = '(`baz`)';
    expect(readStringArg(src, 1)).toEqual({ kind: 'static', value: 'baz', nextIndex: 6 });
  });

  test("returns 'prefix' for template literal with interpolation — value is the static prefix", () => {
    const src = '(`pre.${x}`)';
    const arg = readStringArg(src, 1);
    expect(arg.kind).toBe('prefix');
    if (arg.kind === 'prefix') {
      expect(arg.value).toBe('pre.');
      // nextIndex must land just past the closing backtick so the caller can
      // continue scanning for `,` or `)`.
      expect(src[arg.nextIndex]).toBe(')');
    }
  });

  test("returns 'opaque' for non-string argument", () => {
    const src = '(varName)';
    const arg = readStringArg(src, 1);
    expect(arg.kind).toBe('opaque');
  });

  test('skips leading whitespace before the argument', () => {
    expect(readStringArg("(   'spaced')", 1)).toMatchObject({ kind: 'static', value: 'spaced' });
  });

  test('handles escape sequences inside quoted strings without terminating early', () => {
    const src = "('foo\\'bar')";
    const arg = readStringArg(src, 1);
    expect(arg).toMatchObject({ kind: 'static', value: "foo\\'bar" });
  });
});

describe('findTemplateClose / skipBraceBody', () => {
  test('skipBraceBody walks past nested braces and strings inside `${...}`', () => {
    const src = 'a + { b: "}", c: 1 } + tail';
    // Start just after the first `{` (index 5 → body starts at 5; we pass +1 over `{`).
    const end = skipBraceBody(src, 5);
    // end points just past the matching `}` (index of `}` is 19; returned 20).
    expect(src.slice(end - 1, end)).toBe('}');
  });

  test('findTemplateClose returns the index of the matching backtick', () => {
    const src = '`pre.${a + b}.post`';
    // `from` points at the `$` of the first `${`.
    const dollarIdx = src.indexOf('$');
    const closeIdx = findTemplateClose(src, dollarIdx);
    expect(src[closeIdx]).toBe('`');
    expect(closeIdx).toBe(src.length - 1);
  });

  test('findTemplateClose returns -1 on unterminated template', () => {
    expect(findTemplateClose('`pre.${a}', 5)).toBe(-1);
  });
});

describe('utility helpers', () => {
  test('skipWhitespace stops at first non-space character', () => {
    expect(skipWhitespace('   x', 0)).toBe(3);
  });

  test('lineFromOffset returns 1-based line counting from the start', () => {
    const src = 'a\nb\nc';
    expect(lineFromOffset(src, 0)).toBe(1);
    expect(lineFromOffset(src, 2)).toBe(2);
    expect(lineFromOffset(src, 4)).toBe(3);
  });
});
