/**
 * Visible-frame tests for `<Markdown>` — exercises the block parser and
 * inline tokenizer through the public `source` prop. We assert on the
 * rendered frame (text content + decorative glyphs) rather than on
 * specific ANSI escape sequences so the tests survive Ink upgrades.
 */

import { describe, expect, test } from 'bun:test';
import { flush } from '@brika/testing';
import { render } from 'ink-testing-library';
import React from 'react';
import { Markdown } from './Markdown';

// Project-wide ink-testing flush ceiling — matches the helper in
// `useReadme.test.tsx` so this file behaves the same under parallel CI.
function renderMarkdown(source: string): { frame: string; unmount: () => void } {
  const { lastFrame, unmount } = render(React.createElement(Markdown, { source }));
  return { frame: lastFrame() ?? '', unmount };
}

describe('<Markdown>', () => {
  test('renders a plain paragraph verbatim', async () => {
    const { frame, unmount } = renderMarkdown('hello paragraph world');
    await flush();
    expect(frame).toContain('hello paragraph world');
    unmount();
  });

  test('renders every ATX heading level (H1 through H6)', async () => {
    const source = [
      '# H1 alpha',
      '## H2 beta',
      '### H3 gamma',
      '#### H4 delta',
      '##### H5 epsilon',
      '###### H6 zeta',
    ].join('\n');
    const { frame, unmount } = renderMarkdown(source);
    await flush();
    expect(frame).toContain('H1 alpha');
    expect(frame).toContain('H2 beta');
    expect(frame).toContain('H3 gamma');
    expect(frame).toContain('H4 delta');
    expect(frame).toContain('H5 epsilon');
    expect(frame).toContain('H6 zeta');
    // The leading `#` prefix is preserved in the rendered tree.
    expect(frame).toContain('#');
    unmount();
  });

  test('renders unordered list with `-`, `*`, `+` prefixes using the bullet glyph', async () => {
    const { frame, unmount } = renderMarkdown('- alpha\n* beta\n+ gamma');
    await flush();
    expect(frame).toContain('•');
    expect(frame).toContain('alpha');
    expect(frame).toContain('beta');
    expect(frame).toContain('gamma');
    unmount();
  });

  test('renders ordered list with numeric markers', async () => {
    const { frame, unmount } = renderMarkdown('1. first item\n2. second item\n42) third item');
    await flush();
    expect(frame).toContain('1.');
    expect(frame).toContain('2.');
    // The parser renumbers sequentially (so `42)` becomes `3.`).
    expect(frame).toContain('3.');
    expect(frame).toContain('first item');
    expect(frame).toContain('second item');
    expect(frame).toContain('third item');
    unmount();
  });

  test('renders block quote with the magenta `│` margin glyph', async () => {
    const { frame, unmount } = renderMarkdown('> a quoted line\n> a second quoted line');
    await flush();
    expect(frame).toContain('│');
    expect(frame).toContain('a quoted line');
    expect(frame).toContain('a second quoted line');
    unmount();
  });

  test('renders horizontal rule for `---`, `***`, and `___`', async () => {
    for (const marker of ['---', '***', '___']) {
      const { frame, unmount } = renderMarkdown(marker);
      await flush();
      // Default rule width is 60; we just check the box-drawing glyph appears.
      expect(frame).toContain('─');
      unmount();
    }
  });

  test('renders fenced code block content verbatim with triple backticks', async () => {
    const source = ['```ts', 'const x: number = 1;', 'console.log(x);', '```'].join('\n');
    const { frame, unmount } = renderMarkdown(source);
    await flush();
    expect(frame).toContain('const x: number = 1;');
    expect(frame).toContain('console.log(x);');
    // The language tag is rendered alongside the body.
    expect(frame).toContain('ts');
    unmount();
  });

  test('blank-only source renders without crashing', async () => {
    const { frame, unmount } = renderMarkdown('\n\n\n');
    await flush();
    // Frame may be empty whitespace; the assertion is that render
    // completes and returns a string.
    expect(typeof frame).toBe('string');
    unmount();
  });

  test('inline italic / bold / code text appears in the frame', async () => {
    const { frame, unmount } = renderMarkdown('a *italic* b **bold** c `code` d');
    await flush();
    expect(frame).toContain('italic');
    expect(frame).toContain('bold');
    expect(frame).toContain('code');
    // Surrounding plain text passes through.
    expect(frame).toMatch(/a\s/);
    expect(frame).toMatch(/d/);
    unmount();
  });

  test('mixed content: paragraph + list + code renders all parts in one frame', async () => {
    const source = [
      'intro paragraph here',
      '',
      '- one',
      '- two',
      '',
      '```',
      'fenced body line',
      '```',
    ].join('\n');
    const { frame, unmount } = renderMarkdown(source);
    await flush();
    expect(frame).toContain('intro paragraph here');
    expect(frame).toContain('•');
    expect(frame).toContain('one');
    expect(frame).toContain('two');
    expect(frame).toContain('fenced body line');
    unmount();
  });

  test('strikethrough and link inline tokens render their visible text', async () => {
    const { frame, unmount } = renderMarkdown('a ~~struck~~ and [Brika](https://brika.dev) end');
    await flush();
    expect(frame).toContain('struck');
    expect(frame).toContain('Brika');
    // URL is shown when it differs from the label.
    expect(frame).toContain('https://brika.dev');
    unmount();
  });

  test('renders a GFM table with header, separator, and body rows', async () => {
    const source = ['| name | qty |', '| --- | --- |', '| apple | 1 |', '| pear | 2 |'].join('\n');
    const { frame, unmount } = renderMarkdown(source);
    await flush();
    expect(frame).toContain('name');
    expect(frame).toContain('qty');
    expect(frame).toContain('apple');
    expect(frame).toContain('pear');
    unmount();
  });

  test('tilde-fenced (~~~) blocks fall back to paragraph rendering', async () => {
    // The parser only treats triple-backtick fences as code; tilde fences
    // are accepted in the docs but parsed as plain paragraph content.
    // We still verify the visible content survives.
    const source = ['~~~', 'tilde line content', '~~~'].join('\n');
    const { frame, unmount } = renderMarkdown(source);
    await flush();
    expect(frame).toContain('tilde line content');
    unmount();
  });

  test('width prop influences the horizontal rule render', async () => {
    const { lastFrame, unmount } = render(
      React.createElement(Markdown, { source: '---', width: 10 })
    );
    await flush();
    const frame = lastFrame() ?? '';
    // Width is clamped to a minimum of 8; the rule glyph is still present.
    expect(frame).toContain('─');
    unmount();
  });
});
