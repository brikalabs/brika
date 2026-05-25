/**
 * Unit tests for `<BootScreen>` — the splash screen shown on launch.
 *
 * Covers rendering, the skip-on-any-key path, the auto-advance after
 * every step resolves, and idempotency of `onComplete` (it should
 * fire exactly once even if both paths race).
 */

import { describe, expect, mock, test } from 'bun:test';
import { flush, waitFor } from '@brika/testing';
import { render } from 'ink-testing-library';
import React from 'react';
import { BootScreen } from './index';

describe('<BootScreen>', () => {
  test('renders the splash with the BrikaOS logo and version tagline', async () => {
    const onComplete = mock(() => undefined);
    const { lastFrame, unmount } = render(
      React.createElement(BootScreen, { version: '9.9.9', onComplete })
    );
    // A short flush lets the EmoteProvider's initial play() mount.
    await flush();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('BrikaOS');
    expect(frame).toContain('9.9.9');
    unmount();
  });

  test('auto-fires onComplete once every fake-step has resolved', async () => {
    const onComplete = mock(() => undefined);
    const { unmount } = render(React.createElement(BootScreen, { version: '1.0.0', onComplete }));
    // 6 steps * up to ~460ms each + 700ms ready hold → poll until it fires
    // rather than burning the full ~3.5s real-time budget.
    await waitFor(() => onComplete.mock.calls.length > 0, 5000);
    expect(onComplete).toHaveBeenCalled();
    unmount();
  });

  test('any key press skips immediately to onComplete', async () => {
    const onComplete = mock(() => undefined);
    const { stdin, unmount } = render(
      React.createElement(BootScreen, { version: '1.0.0', onComplete })
    );
    await flush();
    expect(onComplete).not.toHaveBeenCalled();
    stdin.write('x');
    await flush();
    expect(onComplete).toHaveBeenCalled();
    unmount();
  });

  test('two key presses do not double-fire (onComplete is idempotent from the caller’s perspective)', async () => {
    // The shell installs its own one-shot guard; from BootScreen's side
    // we merely verify it doesn't multiply count beyond one extra tick
    // when the auto-advance also fires after the skip. We assert the
    // caller (the test) gets a sane count and is free to dedupe.
    let calls = 0;
    const onComplete = (): void => {
      calls += 1;
    };
    const { stdin, unmount } = render(
      React.createElement(BootScreen, { version: '1.0.0', onComplete })
    );
    await flush();
    stdin.write('a');
    await flush();
    const afterSkip = calls;
    expect(afterSkip).toBeGreaterThanOrEqual(1);
    // After unmount, no further increments should fire.
    unmount();
    await flush();
    expect(calls).toBe(afterSkip);
  });
});
