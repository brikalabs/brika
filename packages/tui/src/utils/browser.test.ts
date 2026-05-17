import { describe, expect, test } from 'bun:test';
import { openInBrowser } from './browser';

// We inject the spawn dependency so the test never invokes the
// platform `open`/`xdg-open` and never launches the user's browser.

describe('openInBrowser', () => {
  test('spawns the platform opener for a normal http(s) URL', () => {
    const calls: ReadonlyArray<string>[] = [];
    openInBrowser('http://127.0.0.1:1234/path', { spawn: (cmd) => calls.push(cmd) });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.at(-1)).toBe('http://127.0.0.1:1234/path');
  });

  test('refuses to spawn for non-http(s) schemes', () => {
    const calls: ReadonlyArray<string>[] = [];
    const record = (cmd: ReadonlyArray<string>): void => {
      calls.push(cmd);
    };
    openInBrowser('javascript:alert(1)', { spawn: record });
    openInBrowser('file:///etc/passwd', { spawn: record });
    openInBrowser('', { spawn: record });
    expect(calls).toHaveLength(0);
  });

  test('swallows spawn errors so the TUI never blocks', () => {
    expect(() =>
      openInBrowser('https://example.com', {
        spawn: () => {
          throw new Error('xdg-open: command not found');
        },
      })
    ).not.toThrow();
  });
});
