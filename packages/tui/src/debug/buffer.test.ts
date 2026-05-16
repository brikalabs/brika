import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { debugBuffer } from './buffer';

// The buffer is a process-wide singleton — reset entries + capacity +
// hooks between every test so the suite is order-independent.
beforeEach(() => {
  debugBuffer.uninstall();
  debugBuffer.clear();
  debugBuffer.setCapacity(500);
});

afterEach(() => {
  debugBuffer.uninstall();
  debugBuffer.clear();
});

describe('push / getEntries', () => {
  test('starts empty', () => {
    expect(debugBuffer.getEntries()).toEqual([]);
  });

  test('push appends one entry with default source', () => {
    debugBuffer.push('log', 'hello');
    const entries = debugBuffer.getEntries();
    expect(entries.length).toBe(1);
    expect(entries[0]?.level).toBe('log');
    expect(entries[0]?.text).toBe('hello');
    expect(entries[0]?.source).toBe('app');
    expect(typeof entries[0]?.id).toBe('number');
    expect(typeof entries[0]?.timestamp).toBe('number');
  });

  test('push with custom source', () => {
    debugBuffer.push('warn', 'careful', 'plugin');
    expect(debugBuffer.getEntries()[0]?.source).toBe('plugin');
  });

  test('ids are monotonic across pushes', () => {
    debugBuffer.push('log', 'a');
    debugBuffer.push('log', 'b');
    debugBuffer.push('log', 'c');
    const ids = debugBuffer.getEntries().map((e) => e.id);
    expect(ids[1]).toBeGreaterThan(ids[0] ?? 0);
    expect(ids[2]).toBeGreaterThan(ids[1] ?? 0);
  });
});

describe('clear', () => {
  test('drops all entries', () => {
    debugBuffer.push('log', 'a');
    debugBuffer.push('log', 'b');
    debugBuffer.clear();
    expect(debugBuffer.getEntries()).toEqual([]);
  });

  test('clear notifies subscribers', () => {
    let calls = 0;
    const unsub = debugBuffer.subscribe(() => {
      calls++;
    });
    debugBuffer.push('log', 'a');
    debugBuffer.clear();
    unsub();
    // push → 1, clear → 1
    expect(calls).toBe(2);
  });
});

describe('subscribe', () => {
  test('listener fires on every push', () => {
    let calls = 0;
    const unsub = debugBuffer.subscribe(() => {
      calls++;
    });
    debugBuffer.push('log', 'a');
    debugBuffer.push('log', 'b');
    unsub();
    debugBuffer.push('log', 'c');
    expect(calls).toBe(2);
  });

  test('multiple listeners all fire', () => {
    let a = 0;
    let b = 0;
    const unsubA = debugBuffer.subscribe(() => {
      a++;
    });
    const unsubB = debugBuffer.subscribe(() => {
      b++;
    });
    debugBuffer.push('log', 'x');
    unsubA();
    unsubB();
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  test('unsubscribe is idempotent', () => {
    const unsub = debugBuffer.subscribe(() => {});
    unsub();
    expect(() => {
      unsub();
    }).not.toThrow();
  });
});

describe('setCapacity / trim', () => {
  test('default keeps everything below 500', () => {
    for (let i = 0; i < 10; i++) {
      debugBuffer.push('log', `m${i}`);
    }
    expect(debugBuffer.getEntries().length).toBe(10);
  });

  test('shrinks capacity and trims existing overflow', () => {
    for (let i = 0; i < 20; i++) {
      debugBuffer.push('log', `m${i}`);
    }
    debugBuffer.setCapacity(10);
    const entries = debugBuffer.getEntries();
    expect(entries.length).toBe(10);
    // The newest 10 should remain — m10…m19.
    expect(entries[0]?.text).toBe('m10');
    expect(entries[9]?.text).toBe('m19');
  });

  test('overflowing past capacity discards the oldest entries', () => {
    debugBuffer.setCapacity(10);
    for (let i = 0; i < 15; i++) {
      debugBuffer.push('log', `m${i}`);
    }
    const entries = debugBuffer.getEntries();
    expect(entries.length).toBe(10);
    expect(entries[0]?.text).toBe('m5');
    expect(entries[9]?.text).toBe('m14');
  });

  test('capacity is floored at 10', () => {
    debugBuffer.setCapacity(1);
    for (let i = 0; i < 15; i++) {
      debugBuffer.push('log', `m${i}`);
    }
    // Even though we asked for 1, the floor is 10.
    expect(debugBuffer.getEntries().length).toBe(10);
  });

  test('capacity floor accepts negative input', () => {
    debugBuffer.setCapacity(-100);
    for (let i = 0; i < 12; i++) {
      debugBuffer.push('log', `m${i}`);
    }
    expect(debugBuffer.getEntries().length).toBe(10);
  });
});

describe('install / uninstall', () => {
  test('install wraps console.log so calls land in the buffer', () => {
    debugBuffer.install();
    console.log('captured');
    const entries = debugBuffer.getEntries();
    expect(entries.length).toBe(1);
    expect(entries[0]?.level).toBe('log');
    expect(entries[0]?.source).toBe('console');
    expect(entries[0]?.text).toBe('captured');
  });

  test('install wraps info / warn / error / debug', () => {
    debugBuffer.install();
    console.info('i');
    console.warn('w');
    console.error('e');
    console.debug('d');
    const levels = debugBuffer.getEntries().map((e) => e.level);
    expect(levels).toEqual(['info', 'warn', 'error', 'debug']);
  });

  test('install is idempotent — second call is a no-op', () => {
    debugBuffer.install();
    const wrappedLog = console.log;
    debugBuffer.install();
    expect(console.log).toBe(wrappedLog);
  });

  test('uninstall restores the original console methods', () => {
    const originalLog = console.log;
    debugBuffer.install();
    expect(console.log).not.toBe(originalLog);
    debugBuffer.uninstall();
    expect(console.log).toBe(originalLog);
  });

  test('uninstall before install is a no-op', () => {
    const originalLog = console.log;
    debugBuffer.uninstall();
    expect(console.log).toBe(originalLog);
  });

  test('uncaughtException listener pushes an error entry', () => {
    debugBuffer.install();
    // Emit synchronously by invoking the listener through `process.emit`.
    // We expect 1 listener (ours) — but Bun's test runner may install
    // its own; check our entry shows up regardless.
    process.emit('uncaughtException', new Error('kaboom'));
    const found = debugBuffer.getEntries().find((e) => e.source === 'uncaughtException');
    expect(found).toBeDefined();
    expect(found?.level).toBe('error');
    expect(found?.text.includes('kaboom')).toBe(true);
  });

  test('unhandledRejection listener pushes an error entry', () => {
    debugBuffer.install();
    process.emit('unhandledRejection', new Error('rejected'), Promise.resolve());
    const found = debugBuffer.getEntries().find((e) => e.source === 'unhandledRejection');
    expect(found).toBeDefined();
    expect(found?.level).toBe('error');
    expect(found?.text.includes('rejected')).toBe(true);
  });

  test('uninstall removes the process error listeners', () => {
    debugBuffer.install();
    const before = process.listenerCount('uncaughtException');
    debugBuffer.uninstall();
    const after = process.listenerCount('uncaughtException');
    expect(after).toBe(before - 1);
  });
});

describe('getEntries returns the live array reference', () => {
  test('snapshot reflects later pushes (documents the contract)', () => {
    const snap = debugBuffer.getEntries();
    debugBuffer.push('log', 'after');
    // The implementation hands out the internal array — callers wanting
    // an immutable snapshot must copy. This test pins that contract so
    // any future switch to defensive cloning surfaces here.
    expect(snap.length).toBeGreaterThan(0);
  });
});
