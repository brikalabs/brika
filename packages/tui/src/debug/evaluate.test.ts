import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { evaluate } from './evaluate';

const originalNodeEnv = process.env.NODE_ENV;
const originalReplFlag = process.env.BRIKA_DISABLE_REPL;

function restoreEnv(): void {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
  if (originalReplFlag === undefined) {
    delete process.env.BRIKA_DISABLE_REPL;
  } else {
    process.env.BRIKA_DISABLE_REPL = originalReplFlag;
  }
}

describe('evaluate — happy path (single expression)', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    delete process.env.BRIKA_DISABLE_REPL;
  });
  afterEach(restoreEnv);

  test('arithmetic expression', async () => {
    const result = await evaluate('1 + 1');
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  test('string expression', async () => {
    const result = await evaluate('"hi"');
    expect(result.ok).toBe(true);
    expect(result.value).toBe('hi');
  });

  test('boolean expression', async () => {
    const result = await evaluate('2 > 1');
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
  });

  test('object literal must be wrapped in parens to be expression', async () => {
    // bare {...} would be parsed as a block — guarded by startsWith('{')
    const result = await evaluate('({ a: 1 })');
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ a: 1 });
  });

  test('awaits a promise', async () => {
    const result = await evaluate('Promise.resolve(42)');
    expect(result.ok).toBe(true);
    expect(result.value).toBe(42);
  });
});

describe('evaluate — explicit-return / multi-statement', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    delete process.env.BRIKA_DISABLE_REPL;
  });
  afterEach(restoreEnv);

  test('snippet with semicolon must return explicitly', async () => {
    const result = await evaluate('const x = 5; return x * 2;');
    expect(result.ok).toBe(true);
    expect(result.value).toBe(10);
  });

  test('snippet starting with `return` is not re-wrapped', async () => {
    const result = await evaluate('return 7');
    expect(result.ok).toBe(true);
    expect(result.value).toBe(7);
  });

  test('snippet starting with a keyword (let) yields undefined without return', async () => {
    const result = await evaluate('let x = 1');
    expect(result.ok).toBe(true);
    expect(result.value).toBeUndefined();
  });

  test('snippet starting with a block statement', async () => {
    const result = await evaluate('{ const y = 3; }');
    expect(result.ok).toBe(true);
    expect(result.value).toBeUndefined();
  });

  test('empty string evaluates to undefined', async () => {
    const result = await evaluate('');
    expect(result.ok).toBe(true);
    expect(result.value).toBeUndefined();
  });

  test('whitespace-only evaluates to undefined', async () => {
    const result = await evaluate('   \n  ');
    expect(result.ok).toBe(true);
    expect(result.value).toBeUndefined();
  });

  test('throw inside async body surfaces as ok:false with the error', async () => {
    const result = await evaluate('throw new Error("nope")');
    expect(result.ok).toBe(false);
    expect(result.value).toBeInstanceOf(Error);
    if (result.value instanceof Error) {
      expect(result.value.message).toBe('nope');
    }
  });

  test('runtime ReferenceError surfaces as ok:false', async () => {
    const result = await evaluate('undefinedVariable + 1');
    expect(result.ok).toBe(false);
    expect(result.value).toBeInstanceOf(Error);
  });

  test('rejected promise surfaces as ok:false', async () => {
    const result = await evaluate('Promise.reject(new Error("rejected"))');
    expect(result.ok).toBe(false);
    expect(result.value).toBeInstanceOf(Error);
  });

  test.each([
    'const x = 1',
    'let x = 1',
    'var x = 1',
    'if (true) { return 1; }',
    'for (let i = 0; i < 1; i++) {}',
    'while (false) {}',
    'function f() {}',
    'class C {}',
    'try { return 1; } catch (e) {}',
    'switch (1) { case 1: return 1; }',
  ])('keyword-leading snippet not wrapped: %s', async (snippet) => {
    const result = await evaluate(snippet);
    // None of these should error from wrapping; they may produce undefined.
    expect(result.ok).toBe(true);
  });
});

describe('evaluate — REPL disabled', () => {
  afterEach(restoreEnv);

  test('returns DISABLED_RESULT when NODE_ENV=production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.BRIKA_DISABLE_REPL;
    const result = await evaluate('1 + 1');
    expect(result.ok).toBe(false);
    expect(result.value).toBeInstanceOf(Error);
    if (result.value instanceof Error) {
      expect(result.value.message).toBe('REPL is disabled in this environment');
    }
  });

  test('returns DISABLED_RESULT when BRIKA_DISABLE_REPL=1', async () => {
    process.env.NODE_ENV = 'development';
    process.env.BRIKA_DISABLE_REPL = '1';
    const result = await evaluate('1 + 1');
    expect(result.ok).toBe(false);
    expect(result.value).toBeInstanceOf(Error);
  });

  test('BRIKA_DISABLE_REPL set to other values does not disable', async () => {
    process.env.NODE_ENV = 'development';
    process.env.BRIKA_DISABLE_REPL = '0';
    const result = await evaluate('1 + 1');
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });
});
