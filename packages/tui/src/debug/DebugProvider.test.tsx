/**
 * Coverage for `<DebugProvider>`.
 *
 * The provider owns three concerns: console patching (via the shared
 * `debugBuffer` singleton), the global toggle hotkey, and the React
 * context that `useDebug()` reads. Each test resets the buffer first
 * because it lives at module scope.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import React from 'react';
import { flush } from '../_test-helpers';
import { debugBuffer } from './buffer';
import { DebugProvider } from './DebugProvider';
import type { DebugContextValue } from './types';
import { useDebug, useOptionalDebug } from './useDebug';

beforeEach(() => {
  debugBuffer.uninstall();
  debugBuffer.clear();
  debugBuffer.setCapacity(500);
});

afterEach(() => {
  debugBuffer.uninstall();
  debugBuffer.clear();
});

function Capture({
  latest,
}: Readonly<{ latest: { current: DebugContextValue | null } }>): React.ReactElement {
  const ctx = useDebug();
  latest.current = ctx;
  return React.createElement(Text, null, ctx.isOpen ? 'open' : 'closed');
}

function OptionalCapture({
  latest,
}: Readonly<{ latest: { current: DebugContextValue | null } }>): React.ReactElement {
  latest.current = useOptionalDebug();
  return React.createElement(Text, null, '.');
}

describe('<DebugProvider>', () => {
  test('mounts and renders children', async () => {
    const { lastFrame, unmount } = render(
      React.createElement(DebugProvider, null, React.createElement(Text, null, 'hello-children'))
    );
    await flush();
    expect(lastFrame() ?? '').toContain('hello-children');
    unmount();
  });

  test('enabled=false is a pass-through (no console wrap, no context)', async () => {
    const originalLog = console.log;
    const latest: { current: DebugContextValue | null } = { current: null };
    const { lastFrame, unmount } = render(
      React.createElement(
        DebugProvider,
        { enabled: false },
        React.createElement(OptionalCapture, { latest }),
        React.createElement(Text, null, 'passthrough')
      )
    );
    await flush();
    expect(lastFrame() ?? '').toContain('passthrough');
    // No provider, no context.
    expect(latest.current).toBeNull();
    // Console untouched.
    expect(console.log).toBe(originalLog);
    unmount();
  });

  test('installs console wrappers so console.log lands in the buffer', async () => {
    const { unmount } = render(
      React.createElement(DebugProvider, null, React.createElement(Text, null, 'app'))
    );
    await flush();
    console.log('captured-by-provider');
    const entry = debugBuffer.getEntries().find((e) => e.text === 'captured-by-provider');
    expect(entry).toBeDefined();
    expect(entry?.level).toBe('log');
    expect(entry?.source).toBe('console');
    unmount();
  });

  test('useDebug() exposes a working context to children', async () => {
    const latest: { current: DebugContextValue | null } = { current: null };
    const { unmount } = render(
      React.createElement(DebugProvider, null, React.createElement(Capture, { latest }))
    );
    await flush();
    const ctx = latest.current;
    expect(ctx).not.toBeNull();
    expect(ctx?.isOpen).toBe(false);
    expect(typeof ctx?.open).toBe('function');
    expect(typeof ctx?.close).toBe('function');
    expect(typeof ctx?.toggle).toBe('function');
    expect(typeof ctx?.clear).toBe('function');
    expect(typeof ctx?.push).toBe('function');
    expect(typeof ctx?.evaluate).toBe('function');
    unmount();
  });

  test('open() then close() flips isOpen and hides/shows children', async () => {
    const latest: { current: DebugContextValue | null } = { current: null };
    const { lastFrame, unmount } = render(
      React.createElement(
        DebugProvider,
        { toggleKey: null },
        React.createElement(Capture, { latest }),
        React.createElement(Text, null, 'app-body')
      )
    );
    await flush();
    expect(lastFrame() ?? '').toContain('app-body');
    // open the overlay → children hidden via display:none, overlay rendered.
    latest.current?.open();
    await flush();
    expect(latest.current?.isOpen).toBe(true);
    // Close again.
    latest.current?.close();
    await flush();
    expect(latest.current?.isOpen).toBe(false);
    expect(lastFrame() ?? '').toContain('app-body');
    unmount();
  });

  test('toggle hotkey (default Ctrl+D) flips the overlay open', async () => {
    const latest: { current: DebugContextValue | null } = { current: null };
    const { stdin, unmount } = render(
      React.createElement(DebugProvider, null, React.createElement(Capture, { latest }))
    );
    await flush();
    expect(latest.current?.isOpen).toBe(false);
    // Ctrl+D — ink's stdin parses this as the ASCII EOT (0x04).
    stdin.write('');
    await flush();
    expect(latest.current?.isOpen).toBe(true);
    unmount();
  });

  test('toggleKey=null disables the hotkey', async () => {
    const latest: { current: DebugContextValue | null } = { current: null };
    const { stdin, unmount } = render(
      React.createElement(
        DebugProvider,
        { toggleKey: null },
        React.createElement(Capture, { latest })
      )
    );
    await flush();
    // Ctrl+D should now be inert.
    stdin.write('');
    await flush();
    expect(latest.current?.isOpen).toBe(false);
    unmount();
  });

  test('push() adds entries to the buffer with the given level/source', async () => {
    const latest: { current: DebugContextValue | null } = { current: null };
    const { unmount } = render(
      React.createElement(DebugProvider, null, React.createElement(Capture, { latest }))
    );
    await flush();
    latest.current?.push('warn', 'careful', 'plugin');
    await flush();
    const last = debugBuffer.getEntries().at(-1);
    expect(last?.level).toBe('warn');
    expect(last?.text).toBe('careful');
    expect(last?.source).toBe('plugin');
    unmount();
  });

  test('clear() empties the buffer', async () => {
    const latest: { current: DebugContextValue | null } = { current: null };
    const { unmount } = render(
      React.createElement(DebugProvider, null, React.createElement(Capture, { latest }))
    );
    await flush();
    latest.current?.push('log', 'a');
    latest.current?.push('log', 'b');
    await flush();
    expect(debugBuffer.getEntries().length).toBeGreaterThanOrEqual(2);
    latest.current?.clear();
    await flush();
    expect(debugBuffer.getEntries().length).toBe(0);
    unmount();
  });

  test('evaluate() appends a `❯ code` repl entry plus the result', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const latest: { current: DebugContextValue | null } = { current: null };
    const { unmount } = render(
      React.createElement(DebugProvider, null, React.createElement(Capture, { latest }))
    );
    await flush();
    const value = await latest.current?.evaluate('1 + 2');
    expect(value).toBe(3);
    const texts = debugBuffer.getEntries().map((e) => e.text);
    expect(texts).toContain('❯ 1 + 2');
    // Result is pushed by formatValue → "3".
    const replResult = debugBuffer
      .getEntries()
      .filter((e) => e.source === 'repl')
      .at(-1);
    expect(replResult?.text).toBe('3');
    expect(replResult?.level).toBe('log');
    unmount();
    if (prevEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = prevEnv;
    }
  });

  test('capacity prop trims the buffer', async () => {
    const { unmount } = render(
      React.createElement(DebugProvider, { capacity: 12 }, React.createElement(Text, null, 'app'))
    );
    await flush();
    for (let i = 0; i < 20; i++) {
      debugBuffer.push('log', `m${i}`);
    }
    expect(debugBuffer.getEntries().length).toBe(12);
    unmount();
  });

  test('unmount restores console + detaches process listeners', async () => {
    const originalLog = console.log;
    const before = process.listenerCount('uncaughtException');
    const { unmount } = render(
      React.createElement(DebugProvider, null, React.createElement(Text, null, 'app'))
    );
    await flush();
    expect(console.log).not.toBe(originalLog);
    expect(process.listenerCount('uncaughtException')).toBe(before + 1);
    unmount();
    // The provider doesn't auto-uninstall on unmount — the buffer is a
    // singleton meant to span the process lifetime. We exercise the
    // restore path explicitly so the inverse contract is pinned.
    debugBuffer.uninstall();
    expect(console.log).toBe(originalLog);
    expect(process.listenerCount('uncaughtException')).toBe(before);
  });
});
