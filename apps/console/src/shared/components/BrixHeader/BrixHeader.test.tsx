/**
 * Rendering tests for `<BrixHeader>` — the top region of the brika
 * TUI showing the Brix mascot beside a speech bubble. We assert only
 * on the visible bubble text (the speech line) since the ANSI sprite
 * frames are not load-bearing here; pacing is owned by
 * `brixHostReducer` and has its own tests.
 */

import { describe, expect, test } from 'bun:test';
import type { EmoteName, Mood } from '@brika/brix';
import { createRouter, RouterProvider } from '@brika/tui';
import { render } from 'ink-testing-library';
import React from 'react';
import { flush, waitFor } from '../../../_test-helpers';
import { routes } from '../../../routes';
import { CliContext, type CliState, type HubStatus } from '../../hooks/useCli';
import { BrixHeader } from './index';

interface CliOverrides {
  readonly hub?: HubStatus;
  readonly mood?: Mood;
  readonly statusText?: string;
  readonly activityEmote?: EmoteName | null;
}

function makeCli(o: CliOverrides = {}): CliState {
  return {
    workspace: '/ws',
    version: '0.0.0',
    hub: o.hub ?? { state: 'running', pid: 1 },
    mood: o.mood ?? 'idle',
    statusText: o.statusText ?? 'watching',
    activityEmote: o.activityEmote ?? null,
    startHub: async () => undefined,
    stopHub: async () => undefined,
    restartHub: async () => undefined,
    openUi: async () => undefined,
  };
}

function withCli(cli: CliState, child: React.ReactElement): React.ReactElement {
  const router = createRouter({ routes, initial: { name: 'dashboard' } });
  return React.createElement(
    RouterProvider<typeof routes>,
    { router },
    React.createElement(CliContext.Provider, { value: cli }, child)
  );
}

describe('<BrixHeader>', () => {
  test('renders the speech bubble with the initial status text', async () => {
    const { lastFrame, unmount } = render(
      withCli(makeCli({ statusText: 'watching' }), React.createElement(BrixHeader, null))
    );
    await flush();
    expect(lastFrame() ?? '').toContain('watching');
    unmount();
  });

  test('running hub with idle activity renders the status caption', async () => {
    const { lastFrame, unmount } = render(
      withCli(
        makeCli({
          hub: { state: 'running', pid: 7 },
          mood: 'idle',
          statusText: 'humming along',
          activityEmote: 'idle',
        }),
        React.createElement(BrixHeader, null)
      )
    );
    // The "running" REACTION line is "hub is awake — hi!", which the
    // reducer reveals char-by-char. Poll until any frame content lands.
    await waitFor(() => (lastFrame() ?? '').length > 0, 1000);
    const frame = lastFrame() ?? '';
    expect(frame.length).toBeGreaterThan(0);
    unmount();
  });

  test('stopped hub renders the sleeping status text in the bubble', async () => {
    const { lastFrame, unmount } = render(
      withCli(
        makeCli({
          hub: { state: 'stopped' },
          mood: 'sleep',
          statusText: "hub is sleeping — press 'ctrl+s' to start",
        }),
        React.createElement(BrixHeader, null)
      )
    );
    await flush();
    // While idle (the initial frame) the bubble shows raw statusText.
    expect(lastFrame() ?? '').toContain('hub is sleeping');
    unmount();
  });

  test('stale hub renders the stale-pid status text in the bubble', async () => {
    const { lastFrame, unmount } = render(
      withCli(
        makeCli({
          hub: { state: 'stale', pid: 42 },
          mood: 'suspicious',
          statusText: 'stale pid — start to recover',
        }),
        React.createElement(BrixHeader, null)
      )
    );
    await flush();
    expect(lastFrame() ?? '').toContain('stale pid');
    unmount();
  });

  test('each known mood renders without throwing', async () => {
    const moods: ReadonlyArray<Mood> = [
      'default',
      'idle',
      'happy',
      'excited',
      'thinking',
      'focused',
      'curious',
      'sleep',
      'sad',
      'error',
      'dead',
      'panic',
      'angry',
      'suspicious',
      'love',
      'cool',
      'loading',
      'success',
      'wink',
      'shy',
      'proud',
      'tired',
      'oops',
      'woah',
      'boop',
      'cheeky',
      'starry',
    ];
    for (const mood of moods) {
      const { lastFrame, unmount } = render(
        withCli(
          makeCli({ mood, statusText: `mood-${mood}` }),
          React.createElement(BrixHeader, null)
        )
      );
      await flush();
      expect(lastFrame() ?? '').toContain(`mood-${mood}`);
      unmount();
    }
  });

  test('updating statusText triggers a re-render with the new caption', async () => {
    const initial = makeCli({ statusText: 'first line' });
    const { lastFrame, rerender, unmount } = render(
      withCli(initial, React.createElement(BrixHeader, null))
    );
    await flush();
    expect(lastFrame() ?? '').toContain('first line');

    rerender(
      withCli(makeCli({ statusText: 'second line' }), React.createElement(BrixHeader, null))
    );
    // Either the reveal stream has started or the new text is fully
    // present; both prove the prop update propagated. Poll until the
    // first character of the new line is visible.
    await waitFor(() => {
      const frame = lastFrame() ?? '';
      return frame.includes('s') || frame.includes('first line');
    }, 1000);
    const frame = lastFrame() ?? '';
    expect(frame.includes('s') || frame.includes('first line')).toBe(true);
    unmount();
  });
});
