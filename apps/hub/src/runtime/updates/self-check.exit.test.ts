/**
 * In-process tests for `runSelfCheckAndExit` — we patch
 * `process.stdout.write` and `process.exit` so the function's full
 * body (write → callback → exit, plus the unref'd setTimeout
 * fallback) actually runs without tearing the test runner down.
 *
 * The subprocess sibling (`self-check.subprocess.test.ts`) covers
 * the same path end-to-end against a real fork; both stay because
 * they catch different regressions (subprocess catches flush-on-exit
 * races, in-process gives us coverage credit for the body).
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { runSelfCheck, runSelfCheckAndExit } from './self-check';

interface ExitCall {
  code: number;
}

let stdoutCalls: Array<{ chunk: string; cbCalled: boolean }>;
let exitCalls: ExitCall[];
let stdoutDescriptor: PropertyDescriptor | undefined;
let originalExit: typeof process.exit;

beforeEach(() => {
  stdoutCalls = [];
  exitCalls = [];
  originalExit = process.exit.bind(process);

  const fakeWrite = (
    chunk: string | Uint8Array,
    encodingOrCb?: BufferEncoding | ((err?: Error | null) => void),
    cb?: (err?: Error | null) => void
  ): boolean => {
    const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
    // Record BEFORE invoking the callback — the callback calls our
    // mocked `process.exit`, which throws by design. If we recorded
    // after, the throw would unwind the stack before we landed the
    // assertion data.
    stdoutCalls.push({ chunk: text, cbCalled: callback !== undefined });
    if (callback) {
      callback();
    }
    return true;
  };

  // `process.stdout` is a getter on Bun — overwrite the whole stream
  // (not just `.write`) so the new fake survives property lookups.
  stdoutDescriptor = Object.getOwnPropertyDescriptor(process, 'stdout');
  Object.defineProperty(process, 'stdout', {
    configurable: true,
    get: () => ({ write: fakeWrite }) as unknown as NodeJS.WriteStream,
  });

  process.exit = ((code?: number | null): never => {
    exitCalls.push({ code: code ?? 0 });
    throw new Error(`__test_exit_${code ?? 0}__`);
  }) as typeof process.exit;
});

afterEach(() => {
  if (stdoutDescriptor) {
    Object.defineProperty(process, 'stdout', stdoutDescriptor);
  }
  process.exit = originalExit;
});

describe('runSelfCheckAndExit (in-process)', () => {
  test('writes one JSON line and triggers process.exit(0) via the write callback', () => {
    try {
      runSelfCheckAndExit();
    } catch (err) {
      // The mocked process.exit throws by design; only swallow our marker.
      if (!(err instanceof Error) || !err.message.startsWith('__test_exit_')) {
        throw err;
      }
    }
    expect(stdoutCalls).toHaveLength(1);
    const [first] = stdoutCalls;
    expect(first?.cbCalled).toBe(true);
    expect(first?.chunk.endsWith('\n')).toBe(true);
    const parsed = JSON.parse((first?.chunk ?? '').trim());
    expect(parsed.ok).toBe(true);
    expect(typeof parsed.version).toBe('string');
    expect(parsed.version.length).toBeGreaterThan(0);
    expect(exitCalls).toHaveLength(1);
    expect(exitCalls[0]?.code).toBe(0);
  });
});

describe('runSelfCheck — happy path stays pinned', () => {
  test('returns ok: true with a non-empty version', () => {
    const r = runSelfCheck();
    expect(r.ok).toBe(true);
    expect(r.version.length).toBeGreaterThan(0);
    expect(r.error).toBeUndefined();
  });
});
