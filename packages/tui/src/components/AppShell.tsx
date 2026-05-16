/**
 * `<AppShell>` — the outer "window" for a full-screen TUI app.
 *
 *   ╭ Brika · v0.1.0 ──────────────────────────────── 12:42 ─╮
 *   │  …header…                                              │
 *   │ ───────────────────────────────────────────────────── │
 *   │  …nav…                                                 │
 *   │ ───────────────────────────────────────────────────── │
 *   │  …body…                                                │
 *   │ ───────────────────────────────────────────────────── │
 *   │  …footer…                                              │
 *   ╰────────────────────────────────────────────────────────╯
 *
 * Draws its own border manually (top row built by hand) so the
 * `title` can sit inline with the top edge like a real window title.
 * `titleRight` does the same for the right side — useful for status
 * stamps that should read as "window chrome" rather than content.
 *
 * Inside, dividers render with the frame's inner width (read via
 * `useAppShellContext`) so they always span exactly between the
 * vertical bars regardless of terminal size.
 *
 * The shell locks itself to the real terminal dimensions so the
 * whole frame fills the window. Content children inherit `flexGrow`
 * naturally — wrap your scrollable / outlet section in a
 * `<AppShellSection grow>` to let it eat the remaining rows.
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { useTerminalSize } from '../state/useTerminalSize';
import { TerminalTooSmall } from './TerminalTooSmall';

export type AppShellAccent = 'default' | 'cyan' | 'magenta' | 'green' | 'yellow' | 'red';

const ACCENT_COLOR: Readonly<Record<AppShellAccent, string | undefined>> = {
  default: 'gray',
  cyan: 'cyan',
  magenta: 'magenta',
  green: 'green',
  yellow: 'yellow',
  red: 'red',
};

const TL = '╭';
const TR = '╮';
const BL = '╰';
const BR = '╯';
const HZ = '─';

interface AppShellContextValue {
  readonly innerWidth: number;
  readonly accentColor: string | undefined;
}

const AppShellContext = createContext<AppShellContextValue | null>(null);

function useAppShellContext(component: string): AppShellContextValue {
  const ctx = useContext(AppShellContext);
  if (!ctx) {
    throw new Error(`<${component}> must be rendered inside an <AppShell>`);
  }
  return ctx;
}

export interface AppShellProps {
  /** Inline title rendered into the top-left of the frame border. */
  readonly title?: string;
  /** Inline status rendered into the top-right of the frame border. */
  readonly titleRight?: string;
  readonly accent?: AppShellAccent;
  /** Minimum terminal width (cols) required to render the shell. When
   *  the terminal is below this, a `<TerminalTooSmall>` screen takes
   *  over until the user resizes. Default 60. */
  readonly minColumns?: number;
  /** Minimum terminal height (rows) required to render the shell.
   *  Default 14. */
  readonly minRows?: number;
  /** Mascot rendered on the too-small screen. Pass a real mascot
   *  (e.g. a `<BrixStage>` from `@brika/brix`) for branded apps; omit
   *  to fall back to the generic ASCII placeholder. */
  readonly tooSmallMascot?: ReactNode;
  readonly children?: ReactNode;
}

const DEFAULT_MIN_COLUMNS = 60;
const DEFAULT_MIN_ROWS = 14;

export function AppShell({
  title,
  titleRight,
  accent = 'default',
  minColumns = DEFAULT_MIN_COLUMNS,
  minRows = DEFAULT_MIN_ROWS,
  tooSmallMascot,
  children,
}: Readonly<AppShellProps>): React.ReactElement {
  const { columns, rows } = useTerminalSize();
  const accentColor = ACCENT_COLOR[accent];
  const innerWidth = Math.max(2, columns - 2);
  const tooSmall = columns < minColumns || rows < minRows;

  // Title strings; degrade gracefully if the terminal is too narrow
  // to fit both — drop `titleRight` first, then truncate `title`.
  const rawTitle = title ? ` ${title} ` : '';
  const rawTitleRight = titleRight ? ` ${titleRight} ` : '';
  const titleRightText = rawTitle.length + rawTitleRight.length <= innerWidth ? rawTitleRight : '';
  const titleText =
    rawTitle.length <= innerWidth - titleRightText.length
      ? rawTitle
      : `${rawTitle.slice(0, Math.max(0, innerWidth - titleRightText.length - 1))}…`;
  const fillCount = Math.max(0, innerWidth - titleText.length - titleRightText.length);
  const fill = HZ.repeat(fillCount);
  const bottomLine = HZ.repeat(innerWidth);

  // `rows - 1` leaves a parking line for Ink's cursor. With `rows`,
  // Ink emits a trailing newline after the last painted row, which
  // bumps the bottom border off the visible viewport on every render.
  const frameHeight = Math.max(3, rows - 1);

  // Hook calls happen before any conditional return so React sees the
  // same hook order on every render (Rules of Hooks).
  const ctxValue = useMemo(() => ({ innerWidth, accentColor }), [innerWidth, accentColor]);

  // Single Provider + a single Box wrapper keeps React's tree identity
  // stable when the terminal flips between "too small" and back. The
  // warning sits over a hidden copy of the children so in-flight
  // component state (form drafts, scroll positions, ongoing fetches)
  // survives the resize.
  return (
    <AppShellContext.Provider value={ctxValue}>
      <Box
        flexDirection="column"
        width={columns}
        height={frameHeight}
        overflow="hidden"
        display={tooSmall ? 'none' : 'flex'}
      >
        {/* Top border row — manually drawn so the inline title can sit
         *  in the border. */}
        <Box flexShrink={0}>
          <Text color={accentColor}>{TL}</Text>
          {titleText.length > 0 ? <Text bold>{titleText}</Text> : null}
          <Text color={accentColor}>{fill}</Text>
          {titleRightText.length > 0 ? <Text dimColor>{titleRightText}</Text> : null}
          <Text color={accentColor}>{TR}</Text>
        </Box>
        {/* Body — Ink draws the left/right bars across the full height
         *  via `borderStyle` with the top/bottom edges disabled. The
         *  outer overflow="hidden" + body overflowY="hidden" keeps any
         *  too-tall content from pushing the bottom border off-screen. */}
        <Box
          flexDirection="column"
          flexGrow={1}
          flexShrink={1}
          borderStyle="round"
          borderColor={accentColor}
          borderTop={false}
          borderBottom={false}
          paddingX={1}
          overflowY="hidden"
        >
          {children}
        </Box>
        {/* Bottom border row */}
        <Box flexShrink={0}>
          <Text color={accentColor}>
            {BL}
            {bottomLine}
            {BR}
          </Text>
        </Box>
      </Box>
      {tooSmall ? (
        <TerminalTooSmall minColumns={minColumns} minRows={minRows} mascot={tooSmallMascot} />
      ) : null}
    </AppShellContext.Provider>
  );
}

export interface AppShellSectionProps {
  /** Let this section eat the remaining vertical space. */
  readonly grow?: boolean;
  readonly children?: ReactNode;
}

export function AppShellSection({
  grow = false,
  children,
}: Readonly<AppShellSectionProps>): React.ReactElement {
  // The `grow` section is the one that should absorb a terminal
  // shrink — keeping the chrome (header/footer/divider) at their
  // natural heights and forcing the main content to fit. We mark it
  // `flexShrink: 1` so Yoga is allowed to squeeze it, and add
  // `overflow="hidden"` so any inner content that can't shrink any
  // further (a fixed-size button row, a min-height pane) is clipped
  // INSIDE the section's bounds instead of bleeding past the
  // footer. Non-grow sections stay rigid — they're the chrome.
  return (
    <Box
      flexDirection="column"
      flexGrow={grow ? 1 : 0}
      flexShrink={grow ? 1 : 0}
      overflow={grow ? 'hidden' : undefined}
    >
      {children}
    </Box>
  );
}

export function AppShellDivider(): React.ReactElement {
  const { innerWidth } = useAppShellContext('AppShellDivider');
  // -2 to leave room for the surrounding paddingX={1} of the body column.
  const span = Math.max(1, innerWidth - 2);
  return (
    <Box>
      <Text dimColor>{HZ.repeat(span)}</Text>
    </Box>
  );
}
