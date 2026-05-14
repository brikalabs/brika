import { describe, expect, test } from 'bun:test';
import { openInBrowser } from './browser';

describe('openInBrowser', () => {
  test('does not throw on a normal URL (spawned process orphans cleanly)', () => {
    // We pass `:` instead of a real URL so the spawned `open`/`xdg-open`
    // either no-ops or fails immediately — either way the function must
    // return synchronously without surfacing the error.
    expect(() => openInBrowser('http://invalid.localtest.mortar.example/')).not.toThrow();
  });

  test('swallows Bun.spawn errors (e.g. xdg-open missing on minimal Linux)', () => {
    // Even a deliberately malformed URL must not throw — the
    // contract is "best-effort, never blocks the TUI".
    expect(() => openInBrowser('')).not.toThrow();
  });
});
