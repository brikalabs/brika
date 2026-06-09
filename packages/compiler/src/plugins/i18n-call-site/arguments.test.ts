/**
 * Unit tests for the argument-list parser in arguments.ts.
 *
 * The parser handles comma-separated argument spans inside `(...)` while
 * correctly skipping:
 *   - nested parens, brackets, braces
 *   - single-quoted and double-quoted string literals (with backslash escapes)
 *   - template literals (including `${...}` interpolations)
 *   - line comments and block comments
 *
 * The public surface is:
 *   - `readArguments(code, openParen)` - parses from just after the `(`
 *   - `skipWhitespace(code, start, limit)` - exported helper
 */

import { describe, expect, test } from 'bun:test';
import { readArguments, skipWhitespace } from './arguments';

// ─── readArguments ───────────────────────────────────────────────────────────

describe('readArguments - basic shapes', () => {
  test('empty argument list returns one empty span', () => {
    // t()  =>  openParen points just past "("
    const code = 't()';
    // openParen = 2 (the position just after the `(`, i.e. position of `)`)
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    expect(result?.closeParen).toBe(2);
    // One span for the sole (empty) argument slot
    expect(result?.spans.length).toBe(1);
    expect(result?.spans[0]?.text).toBe('');
  });

  test('single string argument', () => {
    const code = `t('hello')`;
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    expect(result?.spans).toHaveLength(1);
    expect(result?.spans[0]?.text).toBe("'hello'");
  });

  test('two simple arguments', () => {
    const code = `t('key', 'value')`;
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    expect(result?.spans).toHaveLength(2);
    expect(result?.spans[0]?.text).toBe("'key'");
    expect(result?.spans[1]?.text).toBe("'value'");
  });

  test('three arguments', () => {
    const code = `fn('a', 'b', 'c')`;
    const result = readArguments(code, 3);
    expect(result).not.toBeNull();
    expect(result?.spans).toHaveLength(3);
    expect(result?.spans[0]?.text).toBe("'a'");
    expect(result?.spans[1]?.text).toBe("'b'");
    expect(result?.spans[2]?.text).toBe("'c'");
  });

  test('whitespace around arguments is trimmed', () => {
    const code = `fn(  'key'  ,  42  )`;
    const result = readArguments(code, 3);
    expect(result).not.toBeNull();
    expect(result?.spans[0]?.text).toBe("'key'");
    expect(result?.spans[1]?.text).toBe('42');
  });

  test('newlines around arguments are trimmed', () => {
    const code = `fn(\n  'key'\n)`;
    const result = readArguments(code, 3);
    expect(result).not.toBeNull();
    expect(result?.spans[0]?.text).toBe("'key'");
  });

  test('returns null when no closing paren', () => {
    const code = `fn('hello'`;
    const result = readArguments(code, 3);
    expect(result).toBeNull();
  });
});

describe('readArguments - span positions', () => {
  test('start and end positions are correct for single arg', () => {
    const code = `t('hello')`;
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    const span = result?.spans[0];
    expect(code.slice(span?.start, span?.end)).toBe("'hello'");
  });

  test('closeParen position is the index of )', () => {
    const code = `t('a', 'b')`;
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    expect(code[result?.closeParen ?? -1]).toBe(')');
  });
});

describe('readArguments - nested brackets and braces', () => {
  test('object literal as argument is not split at internal commas', () => {
    const code = `t('key', { ns: 'x', count: 1 })`;
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    expect(result?.spans).toHaveLength(2);
    expect(result?.spans[0]?.text).toBe("'key'");
    expect(result?.spans[1]?.text).toBe("{ ns: 'x', count: 1 }");
  });

  test('array literal as argument is not split at internal commas', () => {
    const code = `fn([1, 2, 3], 'x')`;
    const result = readArguments(code, 3);
    expect(result).not.toBeNull();
    expect(result?.spans).toHaveLength(2);
    expect(result?.spans[0]?.text).toBe('[1, 2, 3]');
    expect(result?.spans[1]?.text).toBe("'x'");
  });

  test('nested parens (function call) as argument is not split', () => {
    const code = `fn(foo(1, 2), 'bar')`;
    const result = readArguments(code, 3);
    expect(result).not.toBeNull();
    expect(result?.spans).toHaveLength(2);
    expect(result?.spans[0]?.text).toBe('foo(1, 2)');
    expect(result?.spans[1]?.text).toBe("'bar'");
  });

  test('closing ] or } inside nested depth decrements depth, not done', () => {
    const code = `fn({ a: [1] }, 'x')`;
    const result = readArguments(code, 3);
    expect(result).not.toBeNull();
    expect(result?.spans).toHaveLength(2);
    expect(result?.spans[0]?.text).toBe('{ a: [1] }');
  });
});

describe('readArguments - string literals with commas', () => {
  test('comma inside single-quoted string is not a split', () => {
    const code = `t('key,with,commas', 2)`;
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    expect(result?.spans).toHaveLength(2);
    expect(result?.spans[0]?.text).toBe("'key,with,commas'");
  });

  test('comma inside double-quoted string is not a split', () => {
    const code = `t("key,with,commas", 2)`;
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    expect(result?.spans).toHaveLength(2);
    expect(result?.spans[0]?.text).toBe('"key,with,commas"');
  });

  test('backslash-escaped quote inside string does not terminate string early', () => {
    const code = String.raw`t('he said \'hi\'', 2)`;
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    // The escaped quotes don't end the string
    expect(result?.spans).toHaveLength(2);
  });

  test('backslash-escaped quote in double-quoted string', () => {
    const code = String.raw`t("he said \"hi\"", 2)`;
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    expect(result?.spans).toHaveLength(2);
  });

  test('newline in single-quoted string terminates string early (malformed JS)', () => {
    // skipStringLiteral stops at \n, leaving the cursor on the closing quote.
    // The second `'` starts another string which has no closing quote before `)`,
    // so readArguments returns null for this malformed input.
    const code = "t('key\n', 2)";
    const result = readArguments(code, 2);
    // Malformed input: the second ' starts an unclosed string, so null is expected.
    // (The implementation terminates single-quoted strings at newlines.)
    expect(result).toBeNull();
  });
});

describe('readArguments - template literals', () => {
  test('template literal argument with no interpolation', () => {
    const code = 't(`hello`, 2)';
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    expect(result?.spans).toHaveLength(2);
    expect(result?.spans[0]?.text).toBe('`hello`');
  });

  test('template literal with simple interpolation does not split at comma inside', () => {
    const code = 't(`${a},${b}`, 2)';
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    expect(result?.spans).toHaveLength(2);
    expect(result?.spans[0]?.text).toBe('`${a},${b}`');
  });

  test('template literal with nested string in interpolation', () => {
    const code = "t(`prefix ${'value,with,comma'} suffix`, 2)";
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    expect(result?.spans).toHaveLength(2);
  });

  test('template literal with nested template in interpolation', () => {
    const code = 't(`outer ${`inner`} end`, x)';
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    expect(result?.spans).toHaveLength(2);
  });

  test('nested brace inside template interpolation increments depth', () => {
    // `${ {key: 'val'} }` - object inside interpolation
    const code = 't(`val=${ {a:1} }`, x)';
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    expect(result?.spans).toHaveLength(2);
  });

  test('backslash escape in template literal', () => {
    const code = 't(`line\\nnewline`)';
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    expect(result?.spans).toHaveLength(1);
  });

  test('unterminated template literal reaches end of input gracefully', () => {
    // Missing closing backtick
    const code = 't(`hello';
    const result = readArguments(code, 2);
    expect(result).toBeNull();
  });
});

describe('readArguments - comment skipping', () => {
  test('line comment in argument list is skipped in the cursor walk', () => {
    // The cursor skips over // comments while walking. The split point is still
    // at the comma. trimRightWhitespace only strips whitespace chars, not
    // comment text, so the span text includes the comment on the trailing side.
    const code = "t('key' // this is a comment\n, 2)";
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    expect(result?.spans).toHaveLength(2);
    // The second argument's span should be correctly identified as '2'
    expect(result?.spans[1]?.text).toBe('2');
  });

  test('block comment in argument list is skipped over', () => {
    const code = "t('key' /* opts comment */, 2)";
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    expect(result?.spans).toHaveLength(2);
    expect(result?.spans[1]?.text).toBe('2');
  });

  test('block comment at start of arg (whitespace skip uses skipBlockComment)', () => {
    // skipWhitespace calls skipBlockComment internally
    const code = "t(/* comment */ 'key')";
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    expect(result?.spans[0]?.text).toBe("'key'");
  });

  test('line comment at start of arg (whitespace skip uses skipLineComment)', () => {
    const code = "t(// comment\n'key')";
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    expect(result?.spans[0]?.text).toBe("'key'");
  });
});

describe('readArguments - uncovered lines: lines 37, 39 (depth decrement for ] and })', () => {
  test('closing ] at depth 0 is NOT a close-paren - handled as depth--', () => {
    // This exercises the depth-- branch for ] at depth > 0
    const code = `fn([1], 'b')`;
    const result = readArguments(code, 3);
    expect(result).not.toBeNull();
    expect(result?.spans).toHaveLength(2);
    expect(result?.spans[0]?.text).toBe('[1]');
  });

  test('closing } at depth 0 is NOT a close-paren - handled as depth--', () => {
    const code = `fn({a: 1}, 'b')`;
    const result = readArguments(code, 3);
    expect(result).not.toBeNull();
    expect(result?.spans).toHaveLength(2);
    expect(result?.spans[0]?.text).toBe('{a: 1}');
  });
});

describe('readArguments - uncovered: makeSingleSpan null guard (rawStart undefined)', () => {
  test('splits array is never empty so rawStart guard is defensive (no crash)', () => {
    // The splits array starts with openParen, so there is always at least one entry.
    // This test verifies no crash even with minimal input.
    const code = 't()';
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    // spans length is 1 (empty arg)
    expect(result?.spans.length).toBe(1);
  });
});

// ─── skipWhitespace (exported helper) ────────────────────────────────────────

describe('skipWhitespace', () => {
  test('skips spaces, tabs, newlines, and carriage returns', () => {
    const code = '   \t\n\r  hello';
    const result = skipWhitespace(code, 0, code.length);
    expect(code.slice(result)).toBe('hello');
  });

  test('stops at the limit', () => {
    const code = '   hello';
    const result = skipWhitespace(code, 0, 3);
    expect(result).toBe(3);
  });

  test('stops immediately on non-whitespace', () => {
    const code = 'hello   ';
    const result = skipWhitespace(code, 0, code.length);
    expect(result).toBe(0);
  });

  test('skips // line comment', () => {
    const code = '// comment\nhello';
    const result = skipWhitespace(code, 0, code.length);
    // After line comment, we stop at the newline. skipLineComment returns pos of \n.
    // Then the next iteration sees \n, advances past it.
    // Result should be at 'h'
    expect(code[result]).toBe('h');
  });

  test('skips /* block comment */', () => {
    const code = '/* comment */hello';
    const result = skipWhitespace(code, 0, code.length);
    expect(code[result]).toBe('h');
  });

  test('empty code returns start', () => {
    const result = skipWhitespace('', 0, 0);
    expect(result).toBe(0);
  });

  test('all whitespace returns limit', () => {
    const code = '    ';
    const result = skipWhitespace(code, 0, code.length);
    expect(result).toBe(code.length);
  });
});

// ─── Edge cases: template literal interpolation depth ────────────────────────

describe('readArguments - template interpolation with nested braces (lines 221-240)', () => {
  test('object literal inside template interpolation', () => {
    // `${  { key: 'v' }  }` - the {} inside the interpolation should not close the interpolation
    const code = 't(`x=${{ a: 1, b: 2 }}`)';
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    expect(result?.spans).toHaveLength(1);
  });

  test('deeply nested interpolation in template does not corrupt state', () => {
    // `${fn({a: 1})}` - nested brace inside interpolation
    const code = 't(`res=${fn({a: 1})}`)';
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    expect(result?.spans).toHaveLength(1);
  });

  test('string inside template interpolation (single-quoted)', () => {
    const code = "t(`val=${'hello, world'}`, x)";
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    expect(result?.spans).toHaveLength(2);
  });

  test('string inside template interpolation (double-quoted)', () => {
    const code = 't(`val=${"hello, world"}`, x)';
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    expect(result?.spans).toHaveLength(2);
  });

  test('nested template literal inside interpolation', () => {
    // `outer ${ `inner ${x}` } end`
    const code = 't(`outer ${ `inner ${x}` } end`)';
    const result = readArguments(code, 2);
    expect(result).not.toBeNull();
    expect(result?.spans).toHaveLength(1);
  });
});
