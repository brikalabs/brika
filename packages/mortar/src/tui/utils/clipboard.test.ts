import { describe, expect, test } from 'bun:test';
import { copyLogsToClipboard } from './clipboard';

describe('copyLogsToClipboard', () => {
  test('returns a boolean (does not throw on any platform)', async () => {
    // The result depends on whether pbcopy/xclip/wl-copy/clip is on
    // PATH on the test runner. We don't assert true/false — only that
    // the function fulfills its contract: best-effort, returns a
    // boolean, never throws.
    const result = await copyLogsToClipboard(['line one', 'line two']);
    expect(typeof result).toBe('boolean');
  });

  test('handles an empty input', async () => {
    const result = await copyLogsToClipboard([]);
    expect(typeof result).toBe('boolean');
  });
});
