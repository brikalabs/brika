/**
 * `<Bubble>` — a comic-style speech bubble for terminal UIs.
 *
 *      ╭───────────────────────────────╮
 *   ◀──┤  hub is humming along.        │
 *      ╰───────────────────────────────╯
 *
 * Drawn manually (not via Ink's `borderStyle`) so the tail glyph can
 * merge into the bubble's border at a real T-junction. This is the
 * difference between "speech bubble" and "Brix standing next to a
 * box": the `┤` is the bubble's left edge with a left-pointing branch
 * that the tail attaches to, and the `◀──` lead-in gives the tail
 * enough length to read as an arrow rather than a single glyph
 * jammed into the border.
 *
 * Variants:
 *   - `speech`   — rounded corners, solid border, `◀──┤` tail.
 *   - `thought`  — rounded corners, solid border, `· ·` floating tail
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
export type BubbleTail = 'left' | 'bottom' | 'none';

export interface BubbleProps {
  /** Single-line message inside the bubble. */
  readonly text: string;
  /** Total horizontal cells the bubble occupies (including the tail when `tail = 'left'`). */
  readonly width: number;
  readonly variant?: BubbleVariant;
  readonly tail?: BubbleTail;
  /** For `tail = 'bottom'`: the column (relative to the bubble's left edge)
   *  where the down-pointing tail joint sits. Defaults to the middle. */
  readonly tailX?: number;
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
  /** The lead-in cells extending LEFT of the bubble's edge into the speaker.
   *  Length is the visible tail width. */
  readonly leftTail: string;
}

const SPEECH: BubbleGlyphs = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
  leftJunction: '┤',
  leftTail: '◀─',
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
  leftTail: '· ',
};

const WHISPER: BubbleGlyphs = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '╴',
  vertical: '╵',
  leftJunction: '╵',
  leftTail: '  ',
};

/** Cells of horizontal padding inside the bubble on each side of `text`. */
const INNER_PAD = 2;

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

const BOTTOM_JOINT = '┬';
const BOTTOM_TIP = '▼';

/** Splice a single character into a string at the given column. */
function splice(s: string, col: number, ch: string): string {
  if (col < 0 || col >= s.length) {
    return s;
  }
  return s.slice(0, col) + ch + s.slice(col + 1);
}

export function Bubble({
  text,
  width,
  variant = 'speech',
  tail = 'left',
  tailX,
  borderColor = 'gray',
  textColor,
  dim,
}: Readonly<BubbleProps>): React.ReactElement {
  const g = glyphsFor(variant);
  const showLeftTail = tail === 'left' && variant !== 'whisper';
  const showBottomTail = tail === 'bottom' && variant !== 'whisper';
  const leftTailWidth = showLeftTail ? g.leftTail.length : 0;

  // Bubble box (excluding the left-tail columns when present).
  const boxWidth = Math.max(5, width - leftTailWidth);
  // Content area: `│` + INNER_PAD spaces + text + INNER_PAD spaces + `│`
  // → 2 + 2*INNER_PAD cells of chrome inside the bubble.
  const inner = Math.max(1, boxWidth - (2 + 2 * INNER_PAD));
  const content = fit(text, inner);
  const pad = ' '.repeat(INNER_PAD);

  const horizRun = g.horizontal.repeat(boxWidth - 2);
  const topBorder = `${g.topLeft}${horizRun}${g.topRight}`;
  let bottomBorder = `${g.bottomLeft}${horizRun}${g.bottomRight}`;
  const leftEdge = showLeftTail ? g.leftJunction : g.vertical;

  // Bottom-tail joint splices `┬` into the bottom border at the tail column.
  const joint = Math.max(1, Math.min(boxWidth - 2, tailX ?? Math.floor(boxWidth / 2)));
  if (showBottomTail) {
    bottomBorder = splice(bottomBorder, joint, BOTTOM_JOINT);
  }
  const tailRow = showBottomTail
    ? `${' '.repeat(joint)}${BOTTOM_TIP}${' '.repeat(Math.max(0, boxWidth - joint - 1))}`
    : '';
  const tailGap = ' '.repeat(leftTailWidth);

  return (
    <Box flexDirection="column">
      <Box>
        {showLeftTail && <Text>{tailGap}</Text>}
        <Text color={borderColor}>{topBorder}</Text>
      </Box>
      <Box>
        {showLeftTail && <Text color={borderColor}>{g.leftTail}</Text>}
        <Text color={borderColor}>{`${leftEdge}${pad}`}</Text>
        <Text color={textColor} dimColor={dim}>
          {content}
        </Text>
        <Text color={borderColor}>{`${pad}${g.vertical}`}</Text>
      </Box>
      <Box>
        {showLeftTail && <Text>{tailGap}</Text>}
        <Text color={borderColor}>{bottomBorder}</Text>
      </Box>
      {showBottomTail && (
        <Box>
          <Text color={borderColor}>{tailRow}</Text>
        </Box>
      )}
    </Box>
  );
}
