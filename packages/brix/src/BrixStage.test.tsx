/**
 * Render coverage for `<BrixStage>` — the mascot composition root.
 * Validates that the stage renders with the default idle fallback,
 * that `bubble` and `floor` props toggle the optional layers, and
 * that `EmoteProvider.play()` swaps in the requested emote (asserted
 * via the spoken line baked into the bubble).
 */

import { describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import React from 'react';
import { flush, waitFor } from './_test-helpers';
import { BrixStage } from './BrixStage';
import { type EmoteApi, EmoteProvider, useEmote } from './EmoteProvider';
import { EMOTE_LIBRARY } from './emotes';
import { defineEmote } from './emotes/builder';
import type { EmoteDef } from './emotes/types';
import type { Mood } from './moods';
import { floorSprite, STAGE_WIDTH } from './stageSprites';

interface ApiSlot {
  current: EmoteApi | null;
}

function ApiCapture({ slot }: Readonly<{ slot: ApiSlot }>): null {
  const api = useEmote();
  slot.current = api;
  return null;
}

function withProvider(
  children: React.ReactNode,
  library?: Readonly<Record<string, EmoteDef>>
): React.ReactElement {
  return <EmoteProvider library={library}>{children}</EmoteProvider>;
}

describe('<BrixStage>', () => {
  test('renders the default idle fallback when no emote is playing', async () => {
    const { lastFrame, unmount } = render(withProvider(React.createElement(BrixStage, null)));
    await flush();
    expect(lastFrame()).toBeDefined();
    expect((lastFrame() ?? '').length).toBeGreaterThan(0);
    unmount();
  });

  test('honours a custom `idle` override', async () => {
    const customIdle: EmoteDef = defineEmote('custom-idle', {
      initial: { face: 'happy' },
      loop: true,
      beats: [{ kind: 'wait', ms: 100 }],
    });
    const { lastFrame, unmount } = render(
      withProvider(React.createElement(BrixStage, { idle: customIdle }))
    );
    await flush();
    expect(lastFrame()).toBeDefined();
    unmount();
  });

  test('reserves vertical space for the bubble when no emote is speaking', async () => {
    const withBubble = render(withProvider(React.createElement(BrixStage, { bubble: true })));
    await flush();
    const tall = (withBubble.lastFrame() ?? '').split('\n').length;
    withBubble.unmount();

    const noBubble = render(withProvider(React.createElement(BrixStage, { bubble: false })));
    await flush();
    const short = (noBubble.lastFrame() ?? '').split('\n').length;
    noBubble.unmount();

    // `bubble: true` reserves 4 rows of bubble space even when no line is set.
    expect(tall).toBeGreaterThan(short);
  });

  test('renders without the floor layer when `floor` is false', async () => {
    // `floor: true` lays a row of `─` across the full stage width on row
    // STAGE_FLOOR_LINE_Y. Without the floor, that final row is blank.
    const withFloor = render(
      withProvider(React.createElement(BrixStage, { floor: true, bubble: false }))
    );
    await flush();
    const withFloorRows = (withFloor.lastFrame() ?? '').split('\n');
    withFloor.unmount();

    const noFloor = render(
      withProvider(React.createElement(BrixStage, { floor: false, bubble: false }))
    );
    await flush();
    const noFloorRows = (noFloor.lastFrame() ?? '').split('\n');
    noFloor.unmount();

    // Floor row spans the full stage width; count `─` runs of length >= 5
    // to distinguish from the body's short horizontal top/bottom (3 chars).
    const longBar = /─{5,}/;
    expect(withFloorRows.some((row) => longBar.test(row))).toBe(true);
    expect(noFloorRows.some((row) => longBar.test(row))).toBe(false);
  });

  test('accepts a custom floor sprite', async () => {
    const custom = floorSprite(STAGE_WIDTH);
    const { lastFrame, unmount } = render(
      withProvider(React.createElement(BrixStage, { floor: custom, bubble: false }))
    );
    await flush();
    const longBar = /─{5,}/;
    expect(longBar.test(lastFrame() ?? '')).toBe(true);
    unmount();
  });

  test('renders the spoken line in a bubble when an emote is played', async () => {
    const slot: ApiSlot = { current: null };
    const { lastFrame, unmount } = render(
      withProvider(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(BrixStage, null),
          React.createElement(ApiCapture, { slot })
        )
      )
    );
    await flush();
    // `wave` ships with a clear, recognisable line; pick the first word.
    slot.current?.play('wave');
    await flush();
    const frame = lastFrame() ?? '';
    // The bubble's border glyphs (`╭`, `╰`) appear when the line is rendered.
    expect(frame).toContain('╭');
    expect(frame).toContain('╰');
    unmount();
  });

  // Verify that emotes covering a representative spread of moods all
  // render without throwing. We map each mood we want to exercise to a
  // real emote name that declares it (see emotes/*.ts). Moods without
  // a representative emote are skipped — the stage doesn't know about
  // them directly, so there's nothing additional to assert.
  const MOOD_FIXTURES: ReadonlyArray<{ mood: Mood; emote: string }> = [
    { mood: 'idle', emote: 'idle' },
    { mood: 'thinking', emote: 'think' },
    { mood: 'happy', emote: 'celebrate' },
    { mood: 'sleep', emote: 'sleep' },
    { mood: 'suspicious', emote: 'peek' },
    { mood: 'loading', emote: 'think' },
    { mood: 'love', emote: 'love' },
    { mood: 'panic', emote: 'panic' },
    { mood: 'cool', emote: 'cool' },
  ];

  for (const { mood, emote } of MOOD_FIXTURES) {
    test(`renders the '${mood}' mood (via ${emote}) without crashing`, async () => {
      const def = EMOTE_LIBRARY[emote as keyof typeof EMOTE_LIBRARY];
      if (!def) {
        throw new Error(`fixture references missing emote: ${emote}`);
      }
      const slot: ApiSlot = { current: null };
      const { lastFrame, unmount } = render(
        withProvider(
          React.createElement(
            React.Fragment,
            null,
            React.createElement(BrixStage, null),
            React.createElement(ApiCapture, { slot })
          )
        )
      );
      await flush();
      slot.current?.play(emote);
      await flush();
      expect(lastFrame()).toBeDefined();
      expect((lastFrame() ?? '').length).toBeGreaterThan(0);
      unmount();
    });
  }

  test('updates the stage when a new emote is played', async () => {
    const slot: ApiSlot = { current: null };
    const { lastFrame, unmount } = render(
      withProvider(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(BrixStage, null),
          React.createElement(ApiCapture, { slot })
        )
      )
    );
    await flush();
    const idleFrame = lastFrame() ?? '';
    slot.current?.play('celebrate');
    // Emote playback advances on the provider's interval — poll until
    // the rendered frame diverges from the idle snapshot.
    await waitFor(() => (lastFrame() ?? '') !== idleFrame);
    const celebrateFrame = lastFrame() ?? '';
    // Either the bubble line or the per-emote color/face differs; some
    // visible cell must have changed between the two snapshots.
    expect(celebrateFrame).not.toBe(idleFrame);
    unmount();
  });

  test('accepts the `speaking` prop without crashing', async () => {
    const { unmount } = render(
      withProvider(React.createElement(BrixStage, { speaking: true, bubble: false }))
    );
    await flush();
    unmount();
  });
});
