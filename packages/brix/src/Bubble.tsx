/**
 * `<Bubble>` — a comic-style speech bubble for terminal UIs.
 *
 *   ╭─────────────────────────╮
 *  ◀┤ hub is humming along.   │
 *   ╰─────────────────────────╯
 *
 * Drawn manually (not via Ink's `borderStyle`) so the tail glyph can
 * merge into the bubble's border at a real T-junction. This is the
 * difference between "speech bubble" and "Brix standing next to a
 * box": the `┤` is the bubble's left edge with a left-pointing branch
 * that the tail attaches to.
 *
 * Variants:
 *   - `speech`   — rounded corners, solid border, `◀┤` tail.
 *   - `thought`  — rounded corners, solid border, `◦` floating tail
 *                  (no T-junction; the bubble looks unattached).
 *   - `whisper`  — rounded corners, dim everything, no tail.
 *
 * The bubble is always exactly 3 rows tall (top border / content /
 * bottom border) so the chrome height is stable. Content longer than
 * the inner width is truncated with `…`.
 */

import { Box, Text } from 'ink';
import type React from 'react';

export type BubbleVariant = 'speech' | 'thought' | 'whisper';
export type BubbleTail = 'left' | 'none';

export interface BubbleProps {
  /** Single-line message inside the bubble. */
  readonly text: string;
  /** Total horizontal cells the bubble occupies (including the tail). */
  readonly width: number;
  readonly variant?: BubbleVariant;
  readonly tail?: BubbleTail;
  readonly borderColor?: string;
  readonly textColor?: string;
  /** Render the text dimmed — useful while idle. */
  readonly dim?: boolean;
}

interface BubbleGlyphs {
  readonly topLeft: string;
  readonly topRight: string;
  readonly bottomLeft: string;
  readonly bottomRight: string;
  readonly horizontal: string;
  readonly vertical: string;
  /** Replaces `vertical` on the middle row where the tail attaches. */
  readonly leftJunction: string;
  /** The single character that extends LEFT of the bubble into the speaker. */
  readonly tailGlyph: string;
}

const SPEECH: BubbleGlyphs = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
  leftJunction: '┤',
  tailGlyph: '◀',
};

const THOUGHT: BubbleGlyphs = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
  // No junction — the bubble border stays unbroken.
  leftJunction: '│',
  tailGlyph: '◦',
};

const WHISPER: BubbleGlyphs = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '╴',
  vertical: '╵',
  leftJunction: '╵',
  tailGlyph: ' ',
};

function glyphsFor(variant: BubbleVariant): BubbleGlyphs {
  switch (variant) {
    case 'thought':
      return THOUGHT;
    case 'whisper':
      return WHISPER;
    default:
      return SPEECH;
  }
}

/** Pad or truncate `text` so the rendered cell count equals `inner`. */
function fit(text: string, inner: number): string {
  if (inner <= 0) {
    return '';
  }
  if (text.length === inner) {
    return text;
  }
  if (text.length < inner) {
    return text + ' '.repeat(inner - text.length);
  }
  if (inner === 1) {
    return '…';
  }
  return `${text.slice(0, inner - 1)}…`;
}

export function Bubble({
  text,
  width,
  variant = 'speech',
  tail = 'left',
  borderColor = 'gray',
  textColor,
  dim,
}: Readonly<BubbleProps>): React.ReactElement {
  const g = glyphsFor(variant);
  const showTail = tail === 'left' && variant !== 'whisper';
  const tailWidth = showTail ? 1 : 0;

  // Bubble (border-to-border, excluding the tail column).
  const boxWidth = Math.max(5, width - tailWidth);
  // Content area sits between `│ ` and ` │` → 4 cells of chrome inside the bubble.
  const inner = Math.max(1, boxWidth - 4);
  const content = fit(text, inner);

  const horizRun = g.horizontal.repeat(boxWidth - 2);
  const topBorder = `${g.topLeft}${horizRun}${g.topRight}`;
  const bottomBorder = `${g.bottomLeft}${horizRun}${g.bottomRight}`;
  // Middle row's left edge is the junction (so the tail attaches to a
  // real T-piece, not a plain vertical line that the eye reads as "box,
  // not bubble").
  const leftEdge = showTail ? g.leftJunction : g.vertical;

  return (
    <Box flexDirection="column">
      <Box>
        {showTail && <Text> </Text>}
        <Text color={borderColor}>{topBorder}</Text>
      </Box>
      <Box>
        {showTail && <Text color={borderColor}>{g.tailGlyph}</Text>}
        <Text color={borderColor}>{`${leftEdge} `}</Text>
        <Text color={textColor} dimColor={dim}>
          {content}
        </Text>
        <Text color={borderColor}>{` ${g.vertical}`}</Text>
      </Box>
      <Box>
        {showTail && <Text> </Text>}
        <Text color={borderColor}>{bottomBorder}</Text>
      </Box>
    </Box>
  );
}
