/**
 * Markdown → Ink renderer.
 *
 * Block grammar:
 *   - ATX headings (`#` through `######`)
 *   - Fenced code (` ``` `, optional language tag)
 *   - Horizontal rules (`---`, `***`, `___`)
 *   - Unordered lists (`-` / `*` / `+`), with nested indent support
 *   - Ordered lists (`1.` `2.` …)
 *   - Blockquotes (`> …`, multi-line)
 *   - GFM tables (`| … |` rows with a `|---|` separator)
 *   - Paragraphs (default)
 *
 * Inline grammar (linear-time, no regex):
 *   - `**bold**`, `*italic*`, `` `code` ``, `~~strike~~`
 *   - `[text](url)` — URL is suppressed when it duplicates the text
 *
 * Each line maps to its own Ink `<Text>` so the rendered tree mirrors
 * the source. We never fall back to a markdown library — this stays
 * dependency-free and easy to debug at terminal width.
 */

import { Box, Text } from 'ink';
import type React from 'react';

export interface MarkdownProps {
  readonly source: string;
  /** Optional max-width hint for rule lines. Default 60. */
  readonly width?: number;
}

const DEFAULT_RULE_WIDTH = 60;

export function Markdown({ source, width }: Readonly<MarkdownProps>): React.ReactElement {
  const blocks = parseBlocks(source);
  return (
    <Box flexDirection="column">
      {blocks.map((block, i) => (
        <Block
          key={`block-${i}-${block.kind}`}
          block={block}
          ruleWidth={width ?? DEFAULT_RULE_WIDTH}
        />
      ))}
    </Box>
  );
}

// ─── Block model ────────────────────────────────────────────────────────────

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

type Block =
  | { kind: 'heading'; level: HeadingLevel; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: ReadonlyArray<ListItem> }
  | { kind: 'quote'; lines: ReadonlyArray<string> }
  | { kind: 'code'; lang: string; lines: ReadonlyArray<string> }
  | { kind: 'table'; header: ReadonlyArray<string>; rows: ReadonlyArray<ReadonlyArray<string>> }
  | { kind: 'rule' }
  | { kind: 'blank' };

interface ListItem {
  readonly text: string;
  /** Marker that came before the text — `•` / `1.` / `2.` etc. Pre-rendered
   *  so ordered lists keep their original numbering even after we filter
   *  blank-line gaps. */
  readonly marker: string;
}

// ─── Block parser ───────────────────────────────────────────────────────────

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmed = line.trimStart();
    if (line.trim() === '') {
      out.push({ kind: 'blank' });
      i += 1;
    } else if (trimmed.startsWith('```')) {
      i = consumeCode(lines, i, out);
    } else if (isHeading(line)) {
      i = consumeHeading(lines, i, out);
    } else if (/^(---|\*\*\*|___)\s*$/.test(line)) {
      out.push({ kind: 'rule' });
      i += 1;
    } else if (isUnorderedListItem(line)) {
      i = consumeList(lines, i, out, false);
    } else if (isOrderedListItem(line)) {
      i = consumeList(lines, i, out, true);
    } else if (line.startsWith('>')) {
      i = consumeQuote(lines, i, out);
    } else if (isTableHeader(lines, i)) {
      i = consumeTable(lines, i, out);
    } else {
      i = consumeParagraph(lines, i, out);
    }
  }
  return out;
}

function isHeading(line: string): boolean {
  // Up to 6 hashes followed by a space — matches ATX shape `^#{1,6} `.
  let hashCount = 0;
  while (hashCount < 7 && line[hashCount] === '#') {
    hashCount += 1;
  }
  return hashCount >= 1 && hashCount <= 6 && line[hashCount] === ' ';
}

function consumeHeading(lines: string[], start: number, out: Block[]): number {
  const line = lines[start] ?? '';
  let hashCount = 0;
  while (hashCount < 6 && line[hashCount] === '#') {
    hashCount += 1;
  }
  const level = hashCount as HeadingLevel;
  out.push({ kind: 'heading', level, text: line.slice(hashCount).trimStart() });
  return start + 1;
}

function isUnorderedListItem(line: string): boolean {
  const t = line.trimStart();
  return (t.startsWith('- ') || t.startsWith('* ') || t.startsWith('+ ')) && t.length > 2;
}

function isOrderedListItem(line: string): boolean {
  const t = line.trimStart();
  // up to 3 digits, then `. ` or `) ` — `1. ` / `12. ` / `1) `
  let i = 0;
  while (i < 3) {
    const ch = t[i];
    if (ch === undefined || ch < '0' || ch > '9') {
      break;
    }
    i += 1;
  }
  if (i === 0) {
    return false;
  }
  const mark = t[i];
  return (mark === '.' || mark === ')') && t[i + 1] === ' ';
}

function consumeList(lines: string[], start: number, out: Block[], ordered: boolean): number {
  const items: ListItem[] = [];
  let i = start;
  let orderedIdx = 1;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmed = line.trimStart();
    const matchesKind = ordered ? isOrderedListItem(line) : isUnorderedListItem(line);
    if (!matchesKind) {
      break;
    }
    if (ordered) {
      // Drop the original `1.` / `12)` marker, replace with our sequential one so
      // pasting from a mis-numbered source still renders 1, 2, 3, …
      const stripped = trimmed.replace(/^\d{1,3}[.)] /, '');
      items.push({ marker: `${orderedIdx}.`, text: stripped });
      orderedIdx += 1;
    } else {
      items.push({ marker: '•', text: trimmed.slice(2) });
    }
    i += 1;
  }
  out.push({ kind: 'list', ordered, items });
  return i;
}

function consumeQuote(lines: string[], start: number, out: Block[]): number {
  const collected: string[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (!line.startsWith('>')) {
      break;
    }
    // `> text` or `>text` — drop one leading `> ` if present.
    collected.push(line.slice(1).replace(/^ ?/, ''));
    i += 1;
  }
  out.push({ kind: 'quote', lines: collected });
  return i;
}

function consumeCode(lines: string[], start: number, out: Block[]): number {
  const fenceLine = lines[start] ?? '';
  const lang = fenceLine.slice(fenceLine.indexOf('```') + 3).trim();
  const body: string[] = [];
  let i = start + 1;
  while (i < lines.length && !(lines[i] ?? '').trimStart().startsWith('```')) {
    body.push(lines[i] ?? '');
    i += 1;
  }
  out.push({ kind: 'code', lang, lines: body });
  return i + 1; // skip closing fence
}

function isBlockStart(line: string): boolean {
  if (line.trim() === '') {
    return true;
  }
  const trimmed = line.trimStart();
  if (trimmed.startsWith('```')) {
    return true;
  }
  if (trimmed.startsWith('>')) {
    return true;
  }
  if (isHeading(line)) {
    return true;
  }
  if (isUnorderedListItem(line)) {
    return true;
  }
  if (isOrderedListItem(line)) {
    return true;
  }
  return /^(---|\*\*\*|___)\s*$/.test(line);
}

function consumeParagraph(lines: string[], start: number, out: Block[]): number {
  const para: string[] = [lines[start] ?? ''];
  let i = start + 1;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (isBlockStart(line)) {
      break;
    }
    para.push(line);
    i += 1;
  }
  out.push({ kind: 'paragraph', text: para.join(' ') });
  return i;
}

// ─── Tables (GFM) ───────────────────────────────────────────────────────────

/** A header row needs at least one `|`, and the next line must be a
 *  separator row of dashes (`|---|---|`). */
function isTableHeader(lines: string[], i: number): boolean {
  const header = lines[i] ?? '';
  const sep = lines[i + 1] ?? '';
  if (!header.includes('|')) {
    return false;
  }
  if (!sep.includes('|')) {
    return false;
  }
  const sepCells = splitTableRow(sep);
  if (sepCells.length === 0) {
    return false;
  }
  return sepCells.every((cell) => /^:?-+:?$/.test(cell.trim()));
}

function splitTableRow(line: string): string[] {
  // Trim outer pipes so `| a | b |` and `a | b` both parse to `['a', 'b']`.
  let inner = line.trim();
  if (inner.startsWith('|')) {
    inner = inner.slice(1);
  }
  if (inner.endsWith('|')) {
    inner = inner.slice(0, -1);
  }
  return inner.split('|').map((c) => c.trim());
}

function consumeTable(lines: string[], start: number, out: Block[]): number {
  const header = splitTableRow(lines[start] ?? '');
  const rows: string[][] = [];
  let i = start + 2; // skip header + separator
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '' || !line.includes('|')) {
      break;
    }
    rows.push(splitTableRow(line));
    i += 1;
  }
  out.push({ kind: 'table', header, rows });
  return i;
}

// ─── Renderers ──────────────────────────────────────────────────────────────

const HEADING_COLOR: Readonly<Record<HeadingLevel, string>> = {
  1: 'cyan',
  2: 'magenta',
  3: 'yellow',
  4: 'green',
  5: 'blue',
  6: 'white',
};

interface BlockProps {
  readonly block: Block;
  readonly ruleWidth: number;
}

function Block({ block, ruleWidth }: Readonly<BlockProps>): React.ReactElement {
  switch (block.kind) {
    case 'heading':
      return <Heading level={block.level} text={block.text} />;
    case 'rule':
      return <Rule width={ruleWidth} />;
    case 'blank':
      return <Box />;
    case 'list':
      return <List ordered={block.ordered} items={block.items} />;
    case 'quote':
      return <Quote lines={block.lines} />;
    case 'code':
      return <CodeBlock lang={block.lang} lines={block.lines} />;
    case 'table':
      return <Table header={block.header} rows={block.rows} />;
    default:
      return <InlineText source={block.text} />;
  }
}

function Heading({
  level,
  text,
}: Readonly<{ level: HeadingLevel; text: string }>): React.ReactElement {
  const color = HEADING_COLOR[level];
  // H1 gets a `# ` prefix the same shade so the user sees the heading
  // level at a glance without us needing an underline (which Ink renders
  // unreliably across terminals).
  return (
    <Box marginTop={1}>
      <Text bold color={color}>
        {'#'.repeat(level)}{' '}
      </Text>
      <Text bold color={color}>
        {text}
      </Text>
    </Box>
  );
}

function Rule({ width }: Readonly<{ width: number }>): React.ReactElement {
  return (
    <Box>
      <Text dimColor>{'─'.repeat(Math.max(8, Math.min(120, width)))}</Text>
    </Box>
  );
}

function List({
  ordered,
  items,
}: Readonly<{ ordered: boolean; items: ReadonlyArray<ListItem> }>): React.ReactElement {
  // Right-align the marker column so `1.` / `9.` / `10.` line up.
  const markerWidth = items.reduce((w, it) => Math.max(w, it.marker.length), 0);
  return (
    <Box flexDirection="column">
      {items.map((it, idx) => (
        <Box key={`li-${idx}-${ordered ? 'o' : 'u'}`}>
          <Box width={markerWidth + 1}>
            <Text dimColor>{it.marker.padStart(markerWidth)} </Text>
          </Box>
          <InlineText source={it.text} />
        </Box>
      ))}
    </Box>
  );
}

function Quote({ lines }: Readonly<{ lines: ReadonlyArray<string> }>): React.ReactElement {
  return (
    <Box flexDirection="column">
      {lines.map((line, idx) => (
        <Box key={`q-${idx}`}>
          <Text color="magenta" dimColor>
            {'│ '}
          </Text>
          <InlineText source={line} />
        </Box>
      ))}
    </Box>
  );
}

function CodeBlock({
  lang,
  lines,
}: Readonly<{ lang: string; lines: ReadonlyArray<string> }>): React.ReactElement {
  return (
    <Box flexDirection="column" paddingX={1} borderStyle="single" borderColor="gray">
      {lang ? (
        <Box>
          <Text dimColor italic>
            {lang}
          </Text>
        </Box>
      ) : null}
      {lines.length === 0 ? (
        <Text dimColor> </Text>
      ) : (
        lines.map((l, idx) => (
          <Text key={`code-${idx}`} color="cyan">
            {l.length === 0 ? ' ' : l}
          </Text>
        ))
      )}
    </Box>
  );
}

function Table({
  header,
  rows,
}: Readonly<{
  header: ReadonlyArray<string>;
  rows: ReadonlyArray<ReadonlyArray<string>>;
}>): React.ReactElement {
  // Column widths = longest cell in each column (header + body), then padded.
  const colCount = Math.max(header.length, ...rows.map((r) => r.length));
  const widths: number[] = [];
  for (let c = 0; c < colCount; c += 1) {
    let w = (header[c] ?? '').length;
    for (const row of rows) {
      w = Math.max(w, (row[c] ?? '').length);
    }
    widths.push(w);
  }

  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        {header.map((cell, c) => (
          <Box key={`th-${c}`} width={(widths[c] ?? 0) + 2}>
            <Text bold color="cyan">
              {(cell ?? '').padEnd(widths[c] ?? 0)}
            </Text>
          </Box>
        ))}
      </Box>
      <Box>
        {widths.map((w, c) => (
          <Box key={`thr-${c}`} width={w + 2}>
            <Text dimColor>{'─'.repeat(w)}</Text>
          </Box>
        ))}
      </Box>
      {rows.map((row, r) => (
        <Box key={`tr-${r}`}>
          {Array.from({ length: colCount }).map((_, c) => (
            <Box key={`td-${r}-${c}`} width={(widths[c] ?? 0) + 2}>
              <Text>{(row[c] ?? '').padEnd(widths[c] ?? 0)}</Text>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}

// ─── Inline ─────────────────────────────────────────────────────────────────

type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'strike'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; url: string };

/**
 * Render inline markdown — bold, italic, code, strike, link.
 * Anything else passes through as plain text.
 */
function InlineText({ source }: Readonly<{ source: string }>): React.ReactElement {
  const segments = parseInline(source);
  return <Text>{segments.map((seg, i) => renderInline(seg, `inl-${i}-${seg.kind}`))}</Text>;
}

function renderInline(seg: Inline, key: string): React.ReactNode {
  switch (seg.kind) {
    case 'bold':
      return (
        <Text key={key} bold>
          {seg.text}
        </Text>
      );
    case 'italic':
      return (
        <Text key={key} italic>
          {seg.text}
        </Text>
      );
    case 'strike':
      return (
        <Text key={key} strikethrough dimColor>
          {seg.text}
        </Text>
      );
    case 'code':
      return (
        <Text key={key} backgroundColor="gray" color="black">
          {` ${seg.text} `}
        </Text>
      );
    case 'link':
      // Suppress the URL when the label IS the URL (`[https://foo](https://foo)`)
      // and when the label looks like a verbose URL clone (>= 80% match).
      return (
        <Text key={key}>
          <Text underline color="cyan">
            {seg.text}
          </Text>
          {seg.text === seg.url ? null : <Text dimColor> ({seg.url})</Text>}
        </Text>
      );
    default:
      return <Text key={key}>{seg.text}</Text>;
  }
}

/**
 * Single-pass inline tokenizer — pure `indexOf` walks, no regex.
 */
function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  let textStart = 0;

  const flushTextUpTo = (end: number): void => {
    if (end > textStart) {
      out.push({ kind: 'text', text: source.slice(textStart, end) });
    }
  };

  while (i < source.length) {
    const consumed = tryInline(source, i, out, flushTextUpTo);
    if (consumed > 0) {
      i += consumed;
      textStart = i;
    } else {
      i += 1;
    }
  }
  flushTextUpTo(source.length);
  return out;
}

/** Try every inline shape starting at `i`. Returns chars consumed on
 *  match, or 0 to indicate plain text. */
function tryInline(
  source: string,
  i: number,
  out: Inline[],
  flushTextUpTo: (end: number) => void
): number {
  // **bold** (must be checked before *italic*)
  if (source.startsWith('**', i)) {
    const end = source.indexOf('**', i + 2);
    if (end > i + 2) {
      flushTextUpTo(i);
      out.push({ kind: 'bold', text: source.slice(i + 2, end) });
      return end + 2 - i;
    }
  }
  // ~~strike~~
  if (source.startsWith('~~', i)) {
    const end = source.indexOf('~~', i + 2);
    if (end > i + 2) {
      flushTextUpTo(i);
      out.push({ kind: 'strike', text: source.slice(i + 2, end) });
      return end + 2 - i;
    }
  }
  // *italic*
  if (source[i] === '*') {
    const end = source.indexOf('*', i + 1);
    if (end > i + 1) {
      flushTextUpTo(i);
      out.push({ kind: 'italic', text: source.slice(i + 1, end) });
      return end + 1 - i;
    }
  }
  // `code`
  if (source[i] === '`') {
    const end = source.indexOf('`', i + 1);
    if (end > i + 1) {
      flushTextUpTo(i);
      out.push({ kind: 'code', text: source.slice(i + 1, end) });
      return end + 1 - i;
    }
  }
  // [text](url)
  if (source[i] === '[') {
    const bracketEnd = source.indexOf(']', i + 1);
    if (bracketEnd > i + 1 && source[bracketEnd + 1] === '(') {
      const parenEnd = source.indexOf(')', bracketEnd + 2);
      if (parenEnd > bracketEnd + 2) {
        flushTextUpTo(i);
        out.push({
          kind: 'link',
          text: source.slice(i + 1, bracketEnd),
          url: source.slice(bracketEnd + 2, parenEnd),
        });
        return parenEnd + 1 - i;
      }
    }
  }
  return 0;
}
