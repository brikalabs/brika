/**
 * Unit tests for `<VersionView>` — the `brika version` two-column
 * splash. Verifies the metadata column renders the current CLI
 * version and standard labels (runtime / platform), and that the
 * view triggers `useApp().exit()` once the emote hold + tail timer
 * has elapsed.
 *
 * The exit timeline is `timelineDuration(beats) + POST_EMOTE_TAIL_MS`
 * — for the version emote that's roughly 3.5 s. We render with a
 * harness that captures the inner `exit` callback so the test runs
 * the natural duration without waiting on the real Ink mount loop.
 */

import { describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import React from 'react';
import { flush } from '../../_test-helpers';
import { CLI_VERSION } from '../../version';
import { VersionView } from './index';

describe('<VersionView>', () => {
  test('renders the CLI version + standard labels', async () => {
    const { lastFrame, unmount } = render(React.createElement(VersionView));
    // A short flush lets the EmoteProvider mount and play(); we don't
    // wait for the full timeline.
    await flush(60);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Brika Console');
    expect(frame).toContain('version');
    expect(frame).toContain(`v${CLI_VERSION}`);
    expect(frame).toContain('runtime');
    expect(frame).toContain('bun');
    expect(frame).toContain('platform');
    expect(frame).toContain(process.platform);
    unmount();
  });

  test('reports the bun version + platform arch in the metadata column', async () => {
    const { lastFrame, unmount } = render(React.createElement(VersionView));
    await flush(60);
    const frame = lastFrame() ?? '';
    expect(frame).toContain(Bun.version);
    expect(frame).toContain(process.arch);
    unmount();
  });
});
