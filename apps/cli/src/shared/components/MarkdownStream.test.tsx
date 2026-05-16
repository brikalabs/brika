/**
 * Visible-frame tests for `<MarkdownStream>` — the one-row-per-source-line
 * renderer used inside `<ScrollArea>`. We assert the frame contains the
 * expected text + glyphs without pinning specific ANSI escape sequences.
 *
 * Particular care: each of the three Sonar-rewritten regex paths
 * (heading, unordered list, ordered list) gets a positive case and a
 * near-miss negative case.
 */

import { describe, expect, test } from 'bun:test';
import { render } from 'ink-testing-library';
import React from 'react';
import { MarkdownStream } from './MarkdownStream';

// Project-wide ink-testing flush ceiling — matches the helper in
// `useReadme.test.tsx`.
function flush(ms = 250): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function renderStream(source: string): { frame: string; unmount: () => void } {
  const { lastFrame, unmount } = render(React.createElement(MarkdownStream, { source }));
  return { frame: lastFrame() ?? '', unmount };
}

describe('<MarkdownStream>', () => {
  test('renders a complete multi-block source with every visible piece present', async () => {
    const source = [
      '# Title alpha',
      '',
      '> quoted line text',
      '',
      '- bullet one',
      '1. ordered one',
      '',
      '```',
      'fenced body',
      '```',
      'plain paragraph line',
    ].join('\n');
    const { frame, unmount } = renderStream(source);
    await flush();
    expect(frame).toContain('Title alpha');
    expect(frame).toContain('quoted line text');
    expect(frame).toContain('│');
    expect(frame).toContain('•');
    expect(frame).toContain('bullet one');
    expect(frame).toContain('ordered one');
    expect(frame).toContain('1.');
    expect(frame).toContain('fenced body');
    expect(frame).toContain('plain paragraph line');
    unmount();
  });

  test('empty source renders without throwing and produces a string frame', async () => {
    const { frame, unmount } = renderStream('');
    await flush();
    expect(typeof frame).toBe('string');
    unmount();
  });

  test('heading regex: `## heading` matches, `##no-space` is a paragraph', async () => {
    const { frame: matchFrame, unmount: u1 } = renderStream('## proper heading');
    await flush();
    expect(matchFrame).toContain('proper heading');
    u1();

    // Near-miss: no space after the hashes — must render as a plain
    // paragraph line that still contains the literal text.
    const { frame: missFrame, unmount: u2 } = renderStream('#####no-space-heading');
    await flush();
    expect(missFrame).toContain('#####no-space-heading');
    u2();
  });

  test('unordered list regex: `- item` matches with `•`, `-no-space` does not', async () => {
    const { frame: matchFrame, unmount: u1 } = renderStream('- list item content');
    await flush();
    expect(matchFrame).toContain('•');
    expect(matchFrame).toContain('list item content');
    u1();

    // Near-miss: missing space after dash — must NOT render the bullet glyph.
    const { frame: missFrame, unmount: u2 } = renderStream('-nospace');
    await flush();
    expect(missFrame).not.toContain('•');
    expect(missFrame).toContain('-nospace');
    u2();
  });

  test('ordered list regex: `12. item` matches, `12.nospace` does not', async () => {
    const { frame: matchFrame, unmount: u1 } = renderStream('12. ordered item content');
    await flush();
    expect(matchFrame).toContain('12.');
    expect(matchFrame).toContain('ordered item content');
    u1();

    // Near-miss: no space after the `.` — the line must NOT be treated
    // as an ordered list. We assert it survives as a literal paragraph.
    const { frame: missFrame, unmount: u2 } = renderStream('12.nospace');
    await flush();
    expect(missFrame).toContain('12.nospace');
    u2();
  });

  test('horizontal rule `---` produces the dim box-drawing line', async () => {
    const { frame, unmount } = renderStream('---');
    await flush();
    expect(frame).toContain('─');
    unmount();
  });

  test('block quote `> text` renders the magenta margin glyph', async () => {
    const { frame, unmount } = renderStream('> quoted body');
    await flush();
    expect(frame).toContain('│');
    expect(frame).toContain('quoted body');
    unmount();
  });

  test('inline bold / italic / code render their visible text', async () => {
    const { frame, unmount } = renderStream('start **bold** mid *italic* end `code` tail');
    await flush();
    expect(frame).toContain('bold');
    expect(frame).toContain('italic');
    expect(frame).toContain('code');
    expect(frame).toContain('start');
    expect(frame).toContain('tail');
    unmount();
  });

  test('long line does not crash (wrap="wrap" is in effect)', async () => {
    const longLine = 'word '.repeat(200).trim();
    const { frame, unmount } = renderStream(longLine);
    await flush();
    // Frame must contain at least one occurrence of the repeated token —
    // we deliberately don't pin the exact wrap output.
    expect(frame).toContain('word');
    unmount();
  });

  test('windowing: `from` and `to` slice the rendered rows', async () => {
    const source = ['row-zero', 'row-one', 'row-two', 'row-three'].join('\n');
    const { lastFrame, unmount } = render(
      React.createElement(MarkdownStream, { source, from: 1, to: 3 })
    );
    await flush();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('row-one');
    expect(frame).toContain('row-two');
    expect(frame).not.toContain('row-zero');
    expect(frame).not.toContain('row-three');
    unmount();
  });

  test('fenced code body renders verbatim between ``` fences', async () => {
    const source = ['```js', 'const a = 1;', '```'].join('\n');
    const { frame, unmount } = renderStream(source);
    await flush();
    expect(frame).toContain('const a = 1;');
    unmount();
  });

  test('rowWindowable marker is exposed for ScrollArea integration', () => {
    expect(MarkdownStream.rowWindowable).toBe(true);
  });
});
