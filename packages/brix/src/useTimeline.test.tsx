/**
 * Tests for `useTimeline` — the React adapter that drives a `Timeline`
 * on a single interval. Verifies that the clock advances `t` over time,
 * that the composited sprite is returned, and that the interval is
 * torn down on unmount.
 */

import { describe, expect, test } from 'bun:test';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import React from 'react';
import { flush, waitFor } from './_test-helpers';
import { parseSprite } from './sprite';
import { clip, type Timeline, timeline } from './timeline';
import { type TimelineState, useTimeline } from './useTimeline';

interface ProbeProps {
  readonly tl: Timeline;
  readonly fps?: number;
  readonly onEnd?: () => void;
  readonly active?: boolean;
  readonly onState: (s: TimelineState) => void;
}

function Probe({ tl, fps, onEnd, active, onState }: Readonly<ProbeProps>): React.ReactElement {
  const state = useTimeline(tl, { fps, onEnd, active });
  onState(state);
  return React.createElement(Text, null, '.');
}

const FRAME_A = parseSprite('A');
const FRAME_B = parseSprite('B');

describe('useTimeline', () => {
  test('returns the first frame at t=0', async () => {
    const tl = timeline([{ clip: clip([FRAME_A, FRAME_B], 100), delay: 0 }]);
    const latest: { current: TimelineState | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        tl,
        onState: (s) => {
          latest.current = s;
        },
      })
    );
    // No flush needed for the synchronous first render.
    expect(latest.current?.sprite).toBeDefined();
    unmount();
  });

  test('clock advances `t` over time at the requested fps', async () => {
    const tl = timeline([{ clip: clip([FRAME_A, FRAME_B], 200) }], { loop: true });
    const latest: { current: TimelineState | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        tl,
        fps: 60,
        onState: (s) => {
          latest.current = s;
        },
      })
    );
    await waitFor(() => (latest.current?.t ?? 0) > 0);
    expect(latest.current?.t).toBeGreaterThan(0);
    unmount();
  });

  test('fires `onEnd` once when a non-looping timeline completes', async () => {
    const tl: Timeline = timeline([{ clip: clip([FRAME_A], 50) }], { loop: false });
    let endCount = 0;
    const { unmount } = render(
      React.createElement(Probe, {
        tl,
        fps: 60,
        onEnd: () => {
          endCount += 1;
        },
        onState: () => undefined,
      })
    );
    await waitFor(() => endCount >= 1);
    expect(endCount).toBe(1);
    unmount();
  });

  test('does not fire `onEnd` for a looping timeline', async () => {
    const tl: Timeline = timeline([{ clip: clip([FRAME_A], 30) }], { loop: true });
    let endCount = 0;
    const { unmount } = render(
      React.createElement(Probe, {
        tl,
        fps: 60,
        onEnd: () => {
          endCount += 1;
        },
        onState: () => undefined,
      })
    );
    await flush();
    expect(endCount).toBe(0);
    unmount();
  });

  test('pauses the clock when `active` is false', async () => {
    const tl = timeline([{ clip: clip([FRAME_A, FRAME_B], 100) }], { loop: true });
    const latest: { current: TimelineState | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        tl,
        active: false,
        onState: (s) => {
          latest.current = s;
        },
      })
    );
    await flush();
    expect(latest.current?.t).toBe(0);
    unmount();
  });

  test('cleanup on unmount cancels the interval (no further callback fires)', async () => {
    const tl: Timeline = timeline([{ clip: clip([FRAME_A], 50) }], { loop: false });
    let endCount = 0;
    const { unmount } = render(
      React.createElement(Probe, {
        tl,
        fps: 60,
        onEnd: () => {
          endCount += 1;
        },
        onState: () => undefined,
      })
    );
    unmount();
    await flush();
    // The 50ms clip would normally finish during the flush window — unmount
    // must have killed the interval before onEnd was scheduled.
    expect(endCount).toBe(0);
  });
});
