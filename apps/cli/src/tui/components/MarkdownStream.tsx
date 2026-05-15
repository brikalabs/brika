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
 * row** (`wrap="truncate-end"` enforces this). Line-level styling
 * still recognises:
 *
 *   - `# / ## / ### / #### …`   headings — bold, accent colour
 *   - `> …`                     blockquote — left bar + blue text
 *   - `- / * / + …`             unordered list — bullet glyph
 *   - `1. / 12) …`              ordered list — keeps its marker
 *   - ` ``` `                    code fence — dim cyan inside
 *   - `` `inline` ``            highlighted spans inside paragraph text
 *
 * Source.length = visible row count exactly, so `<ScrollArea>` can
 * compute total / percent / max-offset with simple integer math.
 */

import { Box, Text } from 'ink';
import type React from 'react';

export interface MarkdownStreamProps {
  /** Raw markdown source. */
  readonly source: string;
}

export function MarkdownStream({ source }: Readonly<MarkdownStreamProps>): React.ReactElement {
  const lines = source.split('\n');
  let inFence = false;
  return (
    <Box flexDirection="column">
      {lines.map((line, idx) => {
        const trimmed = line.trimStart();
        const isFence = trimmed.startsWith('```');
        const styled = renderLine(line, inFence, isFence);
        if (isFence) {
          inFence = !inFence;
        }
        // Per-line key combines index + first 32 chars so that
        // identical consecutive lines (e.g. two blank rows in a code
        // block) get distinct keys for React reconciliation.
        const key = `${idx}:${line.slice(0, 32)}`;
        return (
          <Box key={key} flexShrink={0}>
            {styled}
          </Box>
        );
      })}
    </Box>
  );
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
      <Text color="cyan" wrap="truncate-end">
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
      <Text bold color={level <= 2 ? 'cyan' : undefined} wrap="truncate-end">
        {indent}
        {text}
      </Text>
    );
  }

  // Block quote.
  if (trimmed.startsWith('> ')) {
    return (
      <Text wrap="truncate-end">
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
      <Text wrap="truncate-end">
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
      <Text wrap="truncate-end">
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
    <Text wrap="truncate-end">
      {indent}
      {renderInline(trimmed)}
    </Text>
  );
}

/** Inline emphasis: `**bold**`, `*italic*`, `` `code` ``. Linear,
 *  cheap, deliberately under-powered — we're rendering one terminal
 *  row at a time, complex inline shapes (links, nested) would need
 *  more space than a single line affords. */
function renderInline(text: string): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  let i = 0;
  let cursor = 0;
  const flush = (end: number, key: number): void => {
    if (end > cursor) {
      out.push(<Text key={`t-${key}`}>{text.slice(cursor, end)}</Text>);
    }
  };
  while (i < text.length) {
    if (text.startsWith('**', i)) {
      const end = text.indexOf('**', i + 2);
      if (end > i + 2) {
        flush(i, i);
        out.push(
          <Text key={`b-${i}`} bold>
            {text.slice(i + 2, end)}
          </Text>
        );
        i = end + 2;
        cursor = i;
        continue;
      }
    }
    if (text[i] === '*') {
      const end = text.indexOf('*', i + 1);
      if (end > i + 1) {
        flush(i, i);
        out.push(
          <Text key={`i-${i}`} italic>
            {text.slice(i + 1, end)}
          </Text>
        );
        i = end + 1;
        cursor = i;
        continue;
      }
    }
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        flush(i, i);
        out.push(
          <Text key={`c-${i}`} color="cyan" backgroundColor="black">
            {text.slice(i + 1, end)}
          </Text>
        );
        i = end + 1;
        cursor = i;
        continue;
      }
    }
    i += 1;
  }
  flush(text.length, text.length);
  return out;
}
