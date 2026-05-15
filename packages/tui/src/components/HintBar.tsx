/**
 * `<HintBar>` — bottom-of-view key reference row. Replaces the
 * hand-written hint strings each view used to compose:
 *
 *   <HintBar>
 *     <Hint k="↑↓">select</Hint>
 *     <Hint k="^U/^D">page</Hint>
 *     <Hint k="/" accent="info">filter</Hint>
 *     <Hint k="e" accent="success">enable</Hint>
 *     <Hint k="X" accent="destructive">uninstall</Hint>
 *   </HintBar>
 *
 *   →  ↑↓ select · ^U/^D page · / filter · e enable · X uninstall
 *
 * `Hint` is a leaf — `k` is the visible key glyph(s), children is
 * the action label. Optional `accent` tints the key glyph to match
 * its destructive/benign nature.
 *
 * For the common pattern where each action is bound to a key via
 * `<Button>`, the hints can stay implicit (the buttons document
 * themselves). `<HintBar>` is for actions that don't render as
 * buttons — navigation, scrolling, search-mode toggles.
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { Children, type ReactNode } from 'react';

export type HintAccent = 'default' | 'info' | 'success' | 'warning' | 'destructive';

const ACCENT_COLOR: Readonly<Record<HintAccent, string | undefined>> = {
  default: undefined,
  info: 'cyan',
  success: 'green',
  warning: 'yellow',
  destructive: 'red',
};

export interface HintBarProps {
  readonly children?: ReactNode;
}

export function HintBar({ children }: Readonly<HintBarProps>): React.ReactElement {
  // Insert a dim ` · ` between each child so consumers don't have
  // to interleave separators themselves.
  const items = Children.toArray(children).filter(Boolean);
  return (
    <Box marginTop={1}>
      {items.map((child, i) => (
        <Box key={`hb-${i}`}>
          {i > 0 ? <Text dimColor> · </Text> : null}
          {child}
        </Box>
      ))}
    </Box>
  );
}

export interface HintProps {
  /** Visible key glyph(s) — `↑↓`, `^U/^D`, `Tab`, `e`, … */
  readonly k: ReactNode;
  readonly accent?: HintAccent;
  readonly children?: ReactNode;
}

export function Hint({ k, accent = 'default', children }: Readonly<HintProps>): React.ReactElement {
  const color = ACCENT_COLOR[accent];
  return (
    <Box>
      <Text bold color={color}>
        {k}
      </Text>
      <Text dimColor> {children}</Text>
    </Box>
  );
}
