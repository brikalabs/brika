/**
 * Minimal Markdown → Ink renderer. Covers the subset that shows up in
 * plugin READMEs: headings, paragraphs, bold/italic, inline code, code
 * blocks, links, lists, and horizontal rules. Anything more exotic
 * falls through as plain text.
 *
 * Parser is line-by-line; each line becomes its own Ink `<Text>` so
 * the rendered tree maps 1:1 to the source — easier to debug than a
 * proper AST, and good enough for terminal-width READMEs.
 */

import { Box, Text } from 'ink';
import type React from 'react';

export interface MarkdownProps {
  readonly source: string;
}

export function Markdown({ source }: Readonly<MarkdownProps>): React.ReactElement {
  const blocks = parseBlocks(source);
  return (
    <Box flexDirection="column">
      {blocks.map((block, i) => (
        <Block key={`block-${i}-${block.kind}`} block={block} />
      ))}
    </Box>
  );
}

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: ReadonlyArray<string> }
  | { kind: 'code'; lang: string; lines: ReadonlyArray<string> }
  | { kind: 'rule' }
  | { kind: 'blank' };

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '') {
      out.push({ kind: 'blank' });
      i += 1;
    } else if (/^```/.test(line)) {
      i = consumeCode(lines, i, out);
    } else if (/^#{1,3}\s+/.test(line)) {
      const heading = /^(#{1,3})\s+(.*)$/.exec(line);
      const level = (heading?.[1]?.length ?? 1) as 1 | 2 | 3;
      out.push({ kind: 'heading', level, text: heading?.[2] ?? '' });
      i += 1;
    } else if (/^(---|\*\*\*|___)\s*$/.test(line)) {
      out.push({ kind: 'rule' });
      i += 1;
    } else if (/^[-*+]\s+/.test(line)) {
      i = consumeList(lines, i, out);
    } else {
      i = consumeParagraph(lines, i, out);
    }
  }
  return out;
}

function consumeCode(lines: string[], start: number, out: Block[]): number {
  const fence = /^```(\w*)\s*$/.exec(lines[start] ?? '');
  const lang = fence?.[1] ?? '';
  const body: string[] = [];
  let i = start + 1;
  while (i < lines.length && !/^```\s*$/.test(lines[i] ?? '')) {
    body.push(lines[i] ?? '');
    i += 1;
  }
  out.push({ kind: 'code', lang, lines: body });
  return i + 1; // skip closing fence
}

function consumeList(lines: string[], start: number, out: Block[]): number {
  const items: string[] = [];
  let i = start;
  while (i < lines.length && /^[-*+]\s+/.test(lines[i] ?? '')) {
    items.push((lines[i] ?? '').replace(/^[-*+]\s+/, ''));
    i += 1;
  }
  out.push({ kind: 'list', items });
  return i;
}

function isBlockStart(line: string): boolean {
  return /^(#{1,3}\s+|[-*+]\s+|```)/.test(line);
}

function consumeParagraph(lines: string[], start: number, out: Block[]): number {
  const para: string[] = [lines[start] ?? ''];
  let i = start + 1;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '' || isBlockStart(line)) {
      break;
    }
    para.push(line);
    i += 1;
  }
  out.push({ kind: 'paragraph', text: para.join(' ') });
  return i;
}

const HEADING_COLOR: Readonly<Record<1 | 2 | 3, string>> = {
  1: 'cyan',
  2: 'magenta',
  3: 'yellow',
};

function Block({ block }: Readonly<{ block: Block }>): React.ReactElement {
  if (block.kind === 'heading') {
    const color = HEADING_COLOR[block.level];
    return (
      <Box marginTop={1}>
        <Text bold color={color}>
          {block.text}
        </Text>
      </Box>
    );
  }
  if (block.kind === 'rule') {
    return (
      <Box>
        <Text dimColor>──────────────────────────────</Text>
      </Box>
    );
  }
  if (block.kind === 'blank') {
    return <Box />;
  }
  if (block.kind === 'list') {
    return (
      <Box flexDirection="column">
        {block.items.map((item, idx) => (
          <Box key={`li-${idx}`}>
            <Text dimColor>• </Text>
            <InlineText source={item} />
          </Box>
        ))}
      </Box>
    );
  }
  if (block.kind === 'code') {
    return (
      <Box flexDirection="column" paddingX={1} borderStyle="single" borderColor="gray">
        {block.lines.length === 0 ? (
          <Text dimColor> </Text>
        ) : (
          block.lines.map((l, idx) => (
            <Text key={`code-${idx}`} color="cyan">
              {l}
            </Text>
          ))
        )}
      </Box>
    );
  }
  return <InlineText source={block.text} />;
}

/**
 * Render inline markdown: **bold**, *italic*, `code`, [link](url).
 * Anything else passes through as plain text.
 */
function InlineText({ source }: Readonly<{ source: string }>): React.ReactElement {
  const segments = parseInline(source);
  return (
    <Text>
      {segments.map((seg, i) => {
        const key = `inl-${i}-${seg.kind}`;
        if (seg.kind === 'bold') {
          return (
            <Text key={key} bold>
              {seg.text}
            </Text>
          );
        }
        if (seg.kind === 'italic') {
          return (
            <Text key={key} italic>
              {seg.text}
            </Text>
          );
        }
        if (seg.kind === 'code') {
          return (
            <Text key={key} backgroundColor="gray" color="black">
              {` ${seg.text} `}
            </Text>
          );
        }
        if (seg.kind === 'link') {
          return (
            <Text key={key}>
              <Text underline color="cyan">
                {seg.text}
              </Text>
              <Text dimColor> ({seg.url})</Text>
            </Text>
          );
        }
        return <Text key={key}>{seg.text}</Text>;
      })}
    </Text>
  );
}

type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; url: string };

const INLINE_RE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const match of source.matchAll(INLINE_RE)) {
    const idx = match.index ?? 0;
    if (idx > last) {
      out.push({ kind: 'text', text: source.slice(last, idx) });
    }
    const token = match[0];
    if (token.startsWith('**')) {
      out.push({ kind: 'bold', text: token.slice(2, -2) });
    } else if (token.startsWith('*')) {
      out.push({ kind: 'italic', text: token.slice(1, -1) });
    } else if (token.startsWith('`')) {
      out.push({ kind: 'code', text: token.slice(1, -1) });
    } else {
      const link = /\[([^\]]+)\]\(([^)]+)\)/.exec(token);
      if (link) {
        out.push({ kind: 'link', text: link[1] ?? '', url: link[2] ?? '' });
      }
    }
    last = idx + token.length;
  }
  if (last < source.length) {
    out.push({ kind: 'text', text: source.slice(last) });
  }
  return out;
}
