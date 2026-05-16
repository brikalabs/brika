/**
 * `<MarkdownStream>` — a one-row-per-source-line markdown renderer for
 * scroll contexts.
 *
 * `<Markdown>` is the right primitive for static panes: it consolidates
 * paragraphs, wraps long lines, expands code blocks with borders.
 * That makes its rendered height ≠ source line count, which in turn
 * makes scroll math unreliable — a slice of N source lines can render
 * to anywhere from N to 2-3N visual rows depending on width.
 *
 * `<MarkdownStream>` instead renders **each source line as a single
 * row** (`wrap="wrap"` enforces this). Line-level styling
 * still recognises:
 *
 *   - `# / ## / ### / #### …`   headings — bold, accent colour
 *   - `> …`                     blockquote — left bar + blue text
 *   - `- / * / + …`             unordered list — bullet glyph
 *   - `1. / 12) …`              ordered list — keeps its marker
 *   - ` ``` `                    code fence — dim cyan inside
 *   - `` `inline` ``            highlighted spans inside paragraph text
 *
 * Windowing: passes a stable `source` plus `(from, to)` from a parent
 * `<ScrollArea>`. The full source is parsed exactly once (memoized);
 * each scroll step just slices the pre-rendered array, so long
 * READMEs scroll without re-tokenising every keystroke.
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { useMemo } from 'react';

export interface MarkdownStreamProps {
  /** Raw markdown source — passed FULL even when windowed. */
  readonly source: string;
  /** First visible row (0-indexed). Defaults to 0. */
  readonly from?: number;
  /** Exclusive upper bound; renders rows `[from, to)`. Undefined =
   *  render every row (non-windowed callers). */
  readonly to?: number;
}

interface RenderedRow {
  readonly key: string;
  readonly element: React.ReactElement;
}

/** Static marker read by `<ScrollArea>`'s `detectSliceable`: tells the
 *  scroll wrapper that this child consumes `{from, to}` props instead
 *  of needing the source itself sliced. The marker keeps the parse
 *  memoised on the stable full source string. */
const MARKDOWN_STREAM_WINDOWABLE = true as const;

function MarkdownStreamImpl({
  source,
  from = 0,
  to,
}: Readonly<MarkdownStreamProps>): React.ReactElement {
  // Parse + render every source line ONCE per source string.
  const rows = useMemo<ReadonlyArray<RenderedRow>>(() => parseRows(source), [source]);
  const slice = to === undefined ? rows : rows.slice(from, to);
  return (
    <Box flexDirection="column">
      {slice.map(({ key, element }) => (
        <Box key={key} flexShrink={0}>
          {element}
        </Box>
      ))}
    </Box>
  );
}

export const MarkdownStream = Object.assign(MarkdownStreamImpl, {
  rowWindowable: MARKDOWN_STREAM_WINDOWABLE,
});

function parseRows(source: string): RenderedRow[] {
  const lines = source.split('\n');
  let inFence = false;
  const out: RenderedRow[] = [];
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx] ?? '';
    const trimmed = line.trimStart();
    const isFence = trimmed.startsWith('```');
    const element = renderLine(line, inFence, isFence);
    if (isFence) {
      inFence = !inFence;
    }
    // Per-row key combines index + first 32 chars so identical
    // consecutive lines get distinct keys for React reconciliation.
    out.push({ key: `${idx}:${line.slice(0, 32)}`, element });
  }
  return out;
}

function renderLine(line: string, inFence: boolean, isFence: boolean): React.ReactElement {
  if (isFence) {
    return (
      <Text dimColor color="cyan">
        {line || ' '}
      </Text>
    );
  }
  if (inFence) {
    return (
      <Text color="cyan" wrap="wrap">
        {line || ' '}
      </Text>
    );
  }
  const trimmed = line.trimStart();
  const indent = line.slice(0, line.length - trimmed.length);

  // Headings.
  const hashMatch = /^(#{1,6})\s+(.*)$/.exec(trimmed);
  if (hashMatch) {
    const level = hashMatch[1]?.length ?? 1;
    const text = hashMatch[2] ?? '';
    return (
      <Text bold color={level <= 2 ? 'cyan' : undefined} wrap="wrap">
        {indent}
        {text}
      </Text>
    );
  }

  // Block quote.
  if (trimmed.startsWith('> ')) {
    return (
      <Text wrap="wrap">
        {indent}
        <Text color="magenta" dimColor>
          │{' '}
        </Text>
        <Text>{trimmed.slice(2)}</Text>
      </Text>
    );
  }

  // Horizontal rule.
  if (/^(---|\*\*\*|___)\s*$/.test(trimmed)) {
    return (
      <Text dimColor>
        {indent}
        {'─'.repeat(40)}
      </Text>
    );
  }

  // Unordered list.
  const unordered = /^([-*+])\s+(.*)$/.exec(trimmed);
  if (unordered) {
    return (
      <Text wrap="wrap">
        {indent}
        <Text color="cyan">• </Text>
        {renderInline(unordered[2] ?? '')}
      </Text>
    );
  }

  // Ordered list.
  const ordered = /^(\d{1,3})[.)]\s+(.*)$/.exec(trimmed);
  if (ordered) {
    return (
      <Text wrap="wrap">
        {indent}
        <Text color="cyan">{ordered[1]}.</Text> {renderInline(ordered[2] ?? '')}
      </Text>
    );
  }

  // Blank line.
  if (line.trim().length === 0) {
    return <Text> </Text>;
  }

  // Plain paragraph line with inline emphasis / code.
  return (
    <Text wrap="wrap">
      {indent}
      {renderInline(trimmed)}
    </Text>
  );
}

interface InlineToken {
  readonly open: string;
  readonly tag: 'b' | 'i' | 'c';
  readonly render: (slice: string, key: string) => React.ReactElement;
}

const INLINE_TOKENS: ReadonlyArray<InlineToken> = [
  {
    open: '**',
    tag: 'b',
    render: (slice, key) => (
      <Text key={key} bold>
        {slice}
      </Text>
    ),
  },
  {
    open: '*',
    tag: 'i',
    render: (slice, key) => (
      <Text key={key} italic>
        {slice}
      </Text>
    ),
  },
  {
    open: '`',
    tag: 'c',
    render: (slice, key) => (
      <Text key={key} color="cyan" backgroundColor="black">
        {slice}
      </Text>
    ),
  },
];

/** Try to consume one inline shape starting at `i`. Returns the new
 *  cursor position when something matched, or `null` to mean "no
 *  inline token here, advance one char as plain text". */
function tryInlineMatch(
  text: string,
  i: number,
  out: React.ReactElement[],
  flush: (end: number) => void
): number | null {
  for (const { open, tag, render } of INLINE_TOKENS) {
    if (!text.startsWith(open, i)) {
      continue;
    }
    const end = text.indexOf(open, i + open.length);
    if (end > i + open.length) {
      flush(i);
      out.push(render(text.slice(i + open.length, end), `${tag}-${i}`));
      return end + open.length;
    }
  }
  return null;
}

/** Inline emphasis: `**bold**`, `*italic*`, `` `code` ``. Linear,
 *  cheap, deliberately under-powered — we're rendering one terminal
 *  row at a time, complex inline shapes (links, nested) would need
 *  more space than a single line affords. */
function renderInline(text: string): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  let i = 0;
  let cursor = 0;
  const flush = (end: number): void => {
    if (end > cursor) {
      out.push(<Text key={`t-${cursor}`}>{text.slice(cursor, end)}</Text>);
    }
  };
  while (i < text.length) {
    const next = tryInlineMatch(text, i, out, flush);
    if (next === null) {
      i += 1;
      continue;
    }
    i = next;
    cursor = i;
  }
  flush(text.length);
  return out;
}
