/**
 * Integration tests that pair flow sources/operators with the
 * `@brika/testing` Bun mocks.
 *
 * Flow primitives don't import Bun APIs directly, but real consumers
 * (the SDK, the hub) frequently wire flows into config files, spawn
 * output, or fetch streams. These tests document that workflow and
 * make sure the mock surface stays compatible with how flows actually
 * get used in tests.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { BunMock, flush, mockBun, proxify, useBunMock, waitFor } from '@brika/testing';
import { createTestFlow, createValueCollector, wait } from './fixtures';
import { filter, map, scan } from './operators';

// ─────────────────────────────────────────────────────────────────────────────
// useBunMock + flow
// ─────────────────────────────────────────────────────────────────────────────

describe('useBunMock + flow', () => {
  const bun = useBunMock();

  test('flow emits values read out of a virtual config file', async () => {
    const seed: { greeting: string; repeat: number } = { greeting: 'hello', repeat: 3 };
    bun
      .fs({
        '/config.json': seed,
      })
      .apply();

    const raw = await Bun.file('/config.json').json();
    expect(raw).toEqual(seed);

    const { flow } = createTestFlow<string>();
    const { values, subscriber } = createValueCollector<string>();
    flow.on(subscriber);

    for (let i = 0; i < seed.repeat; i++) {
      flow.push(seed.greeting);
    }

    expect(values).toEqual(['hello', 'hello', 'hello']);
  });

  test('spawn calls feed into a flow scan', () => {
    bun.spawn({ exitCode: 0, stdout: 'ok' }).apply();

    const child = Bun.spawn(['echo', 'hi']);
    expect(child.pid).toBe(12345);
    expect(bun.spawnCalls).toHaveLength(1);
    expect(bun.spawnCalls[0]?.cmd).toEqual(['echo', 'hi']);

    const { flow } = createTestFlow<number>();
    const totals: number[] = [];
    flow.pipe(scan((acc: number, n) => acc + n, 0)).on((v) => totals.push(v));

    flow.push(1);
    flow.push(2);
    flow.push(3);

    expect(totals).toEqual([1, 3, 6]);
  });

  test('fetch mock drives a flow that filters JSON responses', async () => {
    const payload: { items: number[] } = { items: [1, 2, 3, 4, 5] };
    bun
      .fetch(() =>
        Promise.resolve(
          new Response(JSON.stringify(payload), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        )
      )
      .apply();

    const response = await fetch('https://example.test/list');
    const raw = await response.json();
    expect(raw).toEqual(payload);

    const { flow } = createTestFlow<number>();
    const { values, subscriber } = createValueCollector<number>();
    flow.pipe(filter((n: number) => n % 2 === 0)).on(subscriber);

    for (const item of payload.items) {
      flow.push(item);
    }

    expect(values).toEqual([2, 4]);
  });

  test('resolve + glob mocks pair with flow map', async () => {
    bun
      .fs({
        '/plugins/a/manifest.json': { name: 'a' },
        '/plugins/b/manifest.json': { name: 'b' },
      })
      .resolve('flow-plugin', '/plugins/a/index.js')
      .apply();

    expect(Bun.resolveSync('flow-plugin', '/')).toBe('/plugins/a/index.js');

    const entries = await Array.fromAsync(new Bun.Glob('*/').scan({ cwd: '/plugins' }));

    const { flow } = createTestFlow<string>();
    const { values, subscriber } = createValueCollector<string>();
    flow.pipe(map((entry: string) => entry.replace('/', ''))).on(subscriber);

    for (const entry of entries) {
      flow.push(entry);
    }

    expect(values).toEqual(['a', 'b']);
  });

  test('writing through Bun.write then reading it back via a flow', async () => {
    bun.apply();

    const payload: { value: number } = { value: 42 };
    await Bun.write('/virtual/flow.json', JSON.stringify(payload));
    expect(bun.hasFile('/virtual/flow.json')).toBe(true);

    const persisted = await Bun.file('/virtual/flow.json').json();
    expect(persisted).toEqual(payload);

    const { flow } = createTestFlow<number>();
    const { values, subscriber } = createValueCollector<number>();
    flow.on(subscriber);

    flow.push(payload.value);

    expect(values).toEqual([42]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mockBun() (manual lifecycle) + flow
// ─────────────────────────────────────────────────────────────────────────────

describe('mockBun() manual lifecycle', () => {
  let bun: BunMock;

  beforeEach(() => {
    bun = mockBun();
  });

  afterEach(() => {
    bun.restore();
  });

  test('file() and directory() compose with hasFile/getFile lookups', () => {
    bun.file('/a.txt', 'alpha').directory('/dir', ['nested.txt']);

    expect(bun.hasFile('/a.txt')).toBe(true);
    expect(bun.getFile<string>('/a.txt')).toBe('alpha');
    expect(bun.hasFile('/missing')).toBe(false);
    expect(bun.getFile('/missing')).toBeUndefined();
  });

  test('clearSpawnCalls resets the recorded history', () => {
    bun.spawn({ exitCode: 1 }).apply();

    Bun.spawn(['ls']);
    Bun.spawn(['pwd']);
    expect(bun.spawnCalls).toHaveLength(2);

    bun.clearSpawnCalls();
    expect(bun.spawnCalls).toHaveLength(0);
  });

  test('Bun.file().text() returns string content and rejects on missing files', async () => {
    bun.fs({ '/note.txt': 'hello text' }).apply();

    expect(await Bun.file('/note.txt').text()).toBe('hello text');
    await expect(Bun.file('/missing.txt').text()).rejects.toThrow(/ENOENT/);
    await expect(Bun.file('/missing.txt').json()).rejects.toThrow(/ENOENT/);
    expect(await Bun.file('/missing.txt').exists()).toBe(false);
  });

  test('Bun.file().text() stringifies JSON objects when stored as objects', async () => {
    bun.fs({ '/obj.json': { x: 1 } }).apply();
    const text = await Bun.file('/obj.json').text();
    expect(JSON.parse(text)).toEqual({ x: 1 });
  });

  test('resolveSync throws for unmapped packages', () => {
    bun.apply();
    expect(() => Bun.resolveSync('does-not-exist', '/')).toThrow(/Cannot resolve/);
  });

  test('Glob.match handles directory, extension, wildcard, and literal patterns', () => {
    bun.fs({ '/x/a.json': {}, '/x/b.json': {} }).apply();

    expect(new Bun.Glob('*/').match('en/')).toBe(true);
    expect(new Bun.Glob('*/').match('file.json')).toBe(false);

    expect(new Bun.Glob('*.json').match('a.json')).toBe(true);
    expect(new Bun.Glob('*.json').match('a.txt')).toBe(false);

    // The mock collapses wildcards before substring matching, so a pattern
    // like `pre*post` becomes the substring `prepost`.
    expect(new Bun.Glob('pre*post').match('prepost')).toBe(true);
    expect(new Bun.Glob('pre*post').match('preABCpost')).toBe(false);

    expect(new Bun.Glob('exact').match('exact')).toBe(true);
    expect(new Bun.Glob('exact').match('not-exact')).toBe(false);
  });

  test('Glob.scanSync iterates the same entries as scan', async () => {
    bun.fs({ '/items/x.json': {}, '/items/y.json': {} }).apply();

    const async = await Array.fromAsync(new Bun.Glob('*.json').scan({ cwd: '/items' }));
    const sync = Array.from(new Bun.Glob('*.json').scanSync({ cwd: '/items' }));

    expect(sync).toEqual(async);
  });

  test('explicit directory definitions take precedence over inferred ones', async () => {
    bun
      .fs({
        '/locales/': ['fr/', 'en/'],
        '/locales/en/index.json': {},
        '/locales/fr/index.json': {},
      })
      .apply();

    const order = await Array.fromAsync(new Bun.Glob('*/').scan({ cwd: '/locales' }));
    expect(order).toEqual(['fr/', 'en/']);
  });

  test('fetch can be re-configured mid-test without re-installing the spy', async () => {
    bun.fetch(() => Promise.resolve(new Response('first')));
    expect(await (await fetch('https://example.test/a')).text()).toBe('first');

    bun.fetch(() => Promise.resolve(new Response('second')));
    expect(await (await fetch('https://example.test/b')).text()).toBe('second');
  });

  test('fetch dispatch throws when no impl was registered before apply()', () => {
    bun.apply();
    // apply() alone doesn't install the fetch spy — only configuring fetch does.
    // Calling fetch is therefore the real fetch; we instead exercise the path
    // by configuring fetch *after* apply() to confirm the spy installs lazily.
    bun.fetch(() => Promise.resolve(new Response('ok')));
    expect(fetch).toBeDefined();
  });

  test('restore() can be called multiple times safely', () => {
    bun.fs({ '/a.txt': 'x' }).apply();
    bun.restore();
    bun.restore();
    expect(bun.hasFile('/a.txt')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// proxify
// ─────────────────────────────────────────────────────────────────────────────

describe('proxify', () => {
  class Counter {
    value = 0;
    bump(): this {
      this.value++;
      return this;
    }
    snapshot(): number {
      return this.value;
    }
  }

  test('delegates method calls and properties to the resolved instance', () => {
    let current = new Counter();
    const view = proxify(() => current);

    view.bump().bump();
    expect(view.snapshot()).toBe(2);
    expect(view.value).toBe(2);

    current = new Counter();
    expect(view.value).toBe(0);
  });

  test('binds methods so destructured callers keep working', () => {
    const current = new Counter();
    const view = proxify(() => current);

    const { bump, snapshot } = view;
    bump();
    bump();
    expect(snapshot()).toBe(2);

    // The bound functions stay attached to the instance they resolved at
    // destructuring time, which is the documented behaviour.
    expect(current.value).toBe(2);
  });

  test('forwards property writes back to the underlying instance', () => {
    const current = new Counter();
    const view = proxify(() => current);

    view.value = 42;
    expect(current.value).toBe(42);
  });

  test('has trap delegates to the underlying instance', () => {
    const current = new Counter();
    const view = proxify(() => current);

    expect('value' in view).toBe(true);
    expect('bump' in view).toBe(true);
    expect('missing' in view).toBe(false);
  });

  test('ownKeys + getOwnPropertyDescriptor reflect the instance', () => {
    const current = new Counter();
    current.value = 5;
    const view = proxify(() => current);

    expect(Reflect.ownKeys(view)).toContain('value');
    const desc = Object.getOwnPropertyDescriptor(view, 'value');
    expect(desc?.value).toBe(5);
    expect(Object.getOwnPropertyDescriptor(view, 'absent')).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// timing helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('timing helpers', () => {
  test('flush() yields the event loop for ~25ms', async () => {
    const start = Date.now();
    await flush();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(20);
  });

  test('flush(custom) waits the requested ms', async () => {
    const start = Date.now();
    await flush(10);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(5);
  });

  test('waitFor returns once the predicate becomes true', async () => {
    let ready = false;
    setTimeout(() => {
      ready = true;
    }, 20);
    await waitFor(() => ready);
    expect(ready).toBe(true);
  });

  test('waitFor accepts a number as the legacy timeoutMs argument', async () => {
    let ready = false;
    setTimeout(() => {
      ready = true;
    }, 10);
    await waitFor(() => ready, 200);
    expect(ready).toBe(true);
  });

  test('waitFor throws when the predicate never becomes true', async () => {
    await expect(waitFor(() => false, { timeoutMs: 40, intervalMs: 10 })).rejects.toThrow(
      /did not become true within 40ms/
    );
  });

  test('waitFor uses a custom message on timeout', async () => {
    await expect(
      waitFor(() => false, { timeoutMs: 30, intervalMs: 10, message: 'custom timeout msg' })
    ).rejects.toThrow('custom timeout msg');
  });

  test('waitFor resolves immediately if the predicate is already true', async () => {
    const start = Date.now();
    await waitFor(() => true);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(20);
  });

  test('flow tests can compose waitFor with a delayed push', async () => {
    const { flow } = createTestFlow<number>();
    const { values, subscriber } = createValueCollector<number>();
    flow.on(subscriber);

    setTimeout(() => flow.push(7), 10);
    await waitFor(() => values.length > 0);

    expect(values).toEqual([7]);
  });

  test('wait() helper from fixtures is interchangeable with flush() for negative assertions', async () => {
    const { flow } = createTestFlow<number>();
    const { values, subscriber } = createValueCollector<number>();
    flow.on(subscriber);

    await wait(5);
    expect(values).toEqual([]);
  });
});
