/**
 * Render coverage for `<SpriteView>` — the leaf component that paints
 * a composed `Sprite` to the terminal as one Box per row.
 */

import { describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import React from 'react';
import { SpriteView } from './SpriteView';
import { EMPTY_SPRITE, parseSprite } from './sprite';

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 250));
}

describe('<SpriteView>', () => {
  test('renders the empty sprite without crashing', async () => {
    const { lastFrame, unmount } = render(
      React.createElement(SpriteView, { sprite: EMPTY_SPRITE })
    );
    await flush();
    expect(lastFrame()).toBeDefined();
    unmount();
  });

  test('renders sprite glyphs in the output frame', async () => {
    const sprite = parseSprite('hi');
    const { lastFrame, unmount } = render(React.createElement(SpriteView, { sprite }));
    await flush();
    expect(lastFrame()).toContain('hi');
    unmount();
  });

  test('renders multi-row sprites and preserves each row', async () => {
    const sprite = parseSprite(`
      ab
      cd
    `);
    const { lastFrame, unmount } = render(React.createElement(SpriteView, { sprite }));
    await flush();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('ab');
    expect(frame).toContain('cd');
    unmount();
  });

  test('renders transparent cells as spaces', async () => {
    // `·` is the default transparent char — should appear as a space in the output.
    const sprite = parseSprite('a·b');
    const { lastFrame, unmount } = render(React.createElement(SpriteView, { sprite }));
    await flush();
    expect(lastFrame()).toContain('a b');
    unmount();
  });
});
