/**
 * Coverage for `<DebugOverlay>`.
 *
 * The overlay reads from `useDebug()`, so we mount it inside a real
 * `<DebugProvider>` and seed the singleton `debugBuffer` to drive each
 * scenario. The provider's toggleKey is disabled (`null`) so the
 * overlay's own Ctrl+D scroll-down binding never collides with the
 * provider-level toggle.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import React from 'react';
import { flush } from '../_test-helpers';
import { debugBuffer } from './buffer';
import { DebugProvider } from './DebugProvider';
import type { DebugContextValue, DebugLevel } from './types';
import { useDebug } from './useDebug';

beforeEach(() => {
  debugBuffer.uninstall();
  debugBuffer.clear();
  debugBuffer.setCapacity(500);
});

afterEach(() => {
  debugBuffer.uninstall();
  debugBuffer.clear();
});

interface AutoOpenProps {
  readonly latest: { current: DebugContextValue | null };
}

function AutoOpen({ latest }: Readonly<AutoOpenProps>): React.ReactElement {
  const ctx = useDebug();
  latest.current = ctx;
  // Open on mount so the overlay actually renders.
  React.useEffect(() => {
    ctx.open();
  }, [ctx]);
  return React.createElement(Text, null, 'host');
}

function mountOverlay(latest: { current: DebugContextValue | null }) {
  return render(
    React.createElement(
      DebugProvider,
      { toggleKey: null },
      React.createElement(AutoOpen, { latest })
    )
  );
}

describe('<DebugOverlay>', () => {
  test('renders header chrome + REPL prompt when open with no entries', async () => {
    const latest: { current: DebugContextValue | null } = { current: null };
    const { lastFrame, unmount } = mountOverlay(latest);
    await flush();
    const frame = lastFrame() ?? '';
    expect(latest.current?.isOpen).toBe(true);
    // Title + counter band.
    expect(frame).toContain('Debug');
    expect(frame).toContain('0 entries');
    // Empty-state hint.
    expect(frame).toContain('(no entries yet');
    // REPL prompt.
    expect(frame).toContain('❯');
    unmount();
  });

  test('renders entries from the buffer', async () => {
    const latest: { current: DebugContextValue | null } = { current: null };
    const seed: ReadonlyArray<readonly [DebugLevel, string]> = [
      ['log', 'first-message'],
      ['warn', 'second-message'],
    ];
    for (const [lvl, text] of seed) {
      debugBuffer.push(lvl, text);
    }
    const { lastFrame, unmount } = mountOverlay(latest);
    await flush();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('first-message');
    expect(frame).toContain('second-message');
    // No empty-state when entries exist.
    expect(frame).not.toContain('(no entries yet');
    unmount();
  });

  test('each level renders its label tag', async () => {
    const latest: { current: DebugContextValue | null } = { current: null };
    const levels: ReadonlyArray<DebugLevel> = [
      'log',
      'info',
      'warn',
      'error',
      'debug',
      'repl',
      'system',
    ];
    for (const lvl of levels) {
      debugBuffer.push(lvl, `text-${lvl}`);
    }
    const { lastFrame, unmount } = mountOverlay(latest);
    await flush();
    const frame = lastFrame() ?? '';
    // Every level's label must appear, prefixed inside square brackets.
    expect(frame).toContain('[log');
    expect(frame).toContain('[info');
    expect(frame).toContain('[warn');
    expect(frame).toContain('[error');
    expect(frame).toContain('[debug');
    expect(frame).toContain('[repl');
    expect(frame).toContain('[sys');
    // And every text body lands somewhere.
    for (const lvl of levels) {
      expect(frame).toContain(`text-${lvl}`);
    }
    unmount();
  });

  test('uncaughtException-style error entry renders with text + error tag', async () => {
    const latest: { current: DebugContextValue | null } = { current: null };
    debugBuffer.push('error', 'Error: boom\n  at frobnicate', 'uncaughtException');
    const { lastFrame, unmount } = mountOverlay(latest);
    await flush();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[error');
    expect(frame).toContain('Error: boom');
    expect(frame).toContain('1 entries');
    unmount();
  });

  test('long messages do not crash the renderer', async () => {
    const latest: { current: DebugContextValue | null } = { current: null };
    const longText = 'x'.repeat(800);
    debugBuffer.push('log', longText);
    const { lastFrame, unmount } = mountOverlay(latest);
    await flush();
    const frame = lastFrame() ?? '';
    // At least the leading run survives — ink wraps naturally.
    expect(frame.includes('xxxxxxxxxx')).toBe(true);
    // Header still rendered alongside.
    expect(frame).toContain('Debug');
    unmount();
  });

  test('Ctrl+L clears the buffer while the overlay is open', async () => {
    const latest: { current: DebugContextValue | null } = { current: null };
    debugBuffer.push('log', 'pre-clear');
    const { stdin, unmount } = mountOverlay(latest);
    await flush();
    expect(debugBuffer.getEntries().length).toBeGreaterThan(0);
    // The REPL Input captures plain printable chars but `<KeyScope>`
    // keeps Ctrl+L firing through useShortcut.
    stdin.write(''); // Ctrl+L
    await flush();
    expect(debugBuffer.getEntries().length).toBe(0);
    unmount();
  });

  test('paging keys walk through history when there are more entries than fit', async () => {
    const latest: { current: DebugContextValue | null } = { current: null };
    // Push enough entries to ensure paging has somewhere to go.
    for (let i = 0; i < 200; i++) {
      debugBuffer.push('log', `entry-${i}`);
    }
    const { lastFrame, stdin, unmount } = mountOverlay(latest);
    await flush();
    const tailFrame = lastFrame() ?? '';
    // Live tail: newest entry is visible, oldest is not.
    expect(tailFrame).toContain('entry-199');
    // Ctrl+U pages up — bound inside the overlay's KeyScope.
    stdin.write('');
    await flush();
    const pausedFrame = lastFrame() ?? '';
    // After paging up, the header shows paused state.
    expect(pausedFrame).toContain('paused');
    unmount();
  });

  test('evaluate result lands in the buffer with prompt echo + formatted value', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const latest: { current: DebugContextValue | null } = { current: null };
    const { unmount } = mountOverlay(latest);
    await flush();
    expect(latest.current).not.toBeNull();
    const value = await latest.current?.evaluate('2 * 21');
    expect(value).toBe(42);
    // The buffer holds the prompt echo + the formatted result; both
    // entries come from `evaluate` via the singleton, so they're
    // independently visible regardless of React's re-render timing.
    const replEntries = debugBuffer.getEntries().filter((e) => e.source === 'repl');
    expect(replEntries.map((e) => e.text)).toContain('❯ 2 * 21');
    expect(replEntries.map((e) => e.text)).toContain('42');
    // The result entry is logged as a `log` level (success path).
    expect(replEntries.at(-1)?.level).toBe('log');
    unmount();
    if (prevEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = prevEnv;
    }
  });

  test('seeded REPL entries render inside the overlay body', async () => {
    // Pre-seed entries so the overlay reads them on first render —
    // bypasses the post-mount re-render quirk where the buffer mutates
    // the entries array in place (reference only flips on trim).
    const seed: ReadonlyArray<readonly [DebugLevel, string, string]> = [
      ['repl', '❯ 1 + 1', 'repl'],
      ['log', '2', 'repl'],
    ];
    for (const [lvl, text, source] of seed) {
      debugBuffer.push(lvl, text, source);
    }
    const latest: { current: DebugContextValue | null } = { current: null };
    const { lastFrame, unmount } = mountOverlay(latest);
    await flush();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('❯ 1 + 1');
    // The result row is `[log  ] 2` — match the formatted label
    // followed by the value.
    expect(frame).toMatch(/\[log\s*\]\s*2/);
    unmount();
  });
});
