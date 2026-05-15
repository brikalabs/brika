/**
 * `<DebugOverlay>` — the window the engine pops on top of the app
 * when the user presses the toggle hotkey. Three regions stacked
 * vertically:
 *
 *   ╭ Debug · 142 entries · Ctrl+D close ─────────────────╮
 *   │ 12:42:01 [log]   plugin loaded                       │
 *   │ 12:42:03 [error] Error: boom                         │
 *   │                    at frobnicate (foo.ts:12:5)        │
 *   │   …                                                  │
 *   │                                                      │
 *   │ ─────────────────────────────────────────────────── │
 *   │ ❯ _                                                  │
 *   ╰──────────────────────────────────────────────────────╯
 *
 * Keys:
 *   - Esc            close the overlay (works from inside the REPL too)
 *   - ↑ / ↓          scroll the log (line at a time)
 *   - Ctrl+U / Ctrl+D  scroll the log (page at a time, Mac-friendly)
 *   - PgUp / PgDn    same, on keyboards that have them
 *   - Enter          eval the REPL line
 *   - Ctrl+L         clear entries
 *
 * Arrow keys are used for scroll because most Apple keyboards have no
 * PageUp/PageDown — and the single-line Input doesn't consume arrows
 * anyway, so they pass through cleanly even while typing.
 *
 * Rendered exclusively (i.e. AppShell-style "display none" trick
 * applied to siblings) by `<DebugProvider>` so the rest of the app
 * keeps its mounted state but yields the screen to the debugger.
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { Input } from '../components/Input';
import { KeyScope } from '../keys/KeyScope';
import { useKey } from '../keys/useKey';
import { useTerminalSize } from '../state/useTerminalSize';
import type { DebugEntry, DebugLevel } from './types';
import { useDebug } from './useDebug';

const LEVEL_COLOR: Readonly<Record<DebugLevel, string | undefined>> = {
  log: undefined,
  info: 'cyan',
  warn: 'yellow',
  error: 'red',
  debug: 'magenta',
  repl: 'green',
  system: 'blue',
};

const LEVEL_LABEL: Readonly<Record<DebugLevel, string>> = {
  log: 'log  ',
  info: 'info ',
  warn: 'warn ',
  error: 'error',
  debug: 'debug',
  repl: 'repl ',
  system: 'sys  ',
};

export function DebugOverlay(): React.ReactElement {
  const { entries, isOpen, close, clear, evaluate } = useDebug();
  const { columns, rows } = useTerminalSize();
  const [scroll, setScroll] = useState<number>(0);
  const [input, setInput] = useState<string>('');

  // Width / height — fill the terminal but leave a parking line for
  // Ink's cursor (same trick AppShell uses).
  const frameHeight = Math.max(6, rows - 1);
  // 3 lines of chrome (top border, divider, REPL row + bottom border).
  const bodyHeight = Math.max(2, frameHeight - 5);

  // Window the entries against `scroll` so PgUp/PgDn can walk back
  // through older lines while live tail (scroll = 0) snaps to the
  // newest. We render line-per-entry; multi-line text (stacks) wraps
  // naturally inside Ink.
  const visibleEntries = useMemo<ReadonlyArray<DebugEntry>>(() => {
    if (entries.length <= bodyHeight) {
      return entries;
    }
    const end = Math.max(bodyHeight, entries.length - scroll);
    const start = Math.max(0, end - bodyHeight);
    return entries.slice(start, end);
  }, [entries, bodyHeight, scroll]);

  const maxScroll = Math.max(0, entries.length - bodyHeight);

  const scrollUp = useCallback(
    (lines: number) => setScroll((s) => Math.min(maxScroll, s + lines)),
    [maxScroll]
  );
  const scrollDown = useCallback((lines: number) => setScroll((s) => Math.max(0, s - lines)), []);

  // `useKey('escape')` registers a top-level handler, but the Input
  // also has its own escape-listener (it auto-focuses the overlay).
  // Both handlers fire concurrently in Ink — we still bind it here as
  // a safety net for the rare case where the Input loses focus.
  useKey('escape', close, isOpen);
  useKey('upArrow', () => scrollUp(1), isOpen);
  useKey('downArrow', () => scrollDown(1), isOpen);
  useKey('pageUp', () => scrollUp(bodyHeight), isOpen);
  useKey('pageDown', () => scrollDown(bodyHeight), isOpen);
  useKey('ctrl+u', () => scrollUp(bodyHeight), isOpen);
  useKey('ctrl+d', () => scrollDown(bodyHeight), isOpen);
  useKey('ctrl+l', clear, isOpen);

  const onSubmit = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) {
        return;
      }
      setInput('');
      // Snap to tail so the user sees their own command + result.
      setScroll(0);
      await evaluate(trimmed);
    },
    [evaluate]
  );

  const title = ` Debug · ${entries.length} entries `;
  const hint =
    scroll === 0
      ? ' live · ↑↓ scroll · Ctrl+L clear · Esc close '
      : ` paused at -${scroll}/${maxScroll} · ↑↓ scroll · Esc close `;
  const headerFill = Math.max(0, columns - title.length - hint.length - 2);
  const fill = '─'.repeat(headerFill);

  return (
    <Box flexDirection="column" width={columns} height={frameHeight}>
      {/* Top border with inline title + hint, AppShell-style. */}
      <Box flexShrink={0}>
        <Text color="magenta">╭</Text>
        <Text bold color="magenta">
          {title}
        </Text>
        <Text color="magenta">{fill}</Text>
        <Text dimColor>{hint}</Text>
        <Text color="magenta">╮</Text>
      </Box>

      {/* Body. The Box has fixed height so long entries don't push the
       *  REPL row off-screen. */}
      <Box
        flexDirection="column"
        flexShrink={0}
        height={bodyHeight}
        borderStyle="round"
        borderColor="magenta"
        borderTop={false}
        borderBottom={false}
        paddingX={1}
        overflowY="hidden"
      >
        {visibleEntries.length === 0 ? (
          <Text dimColor>(no entries yet — start logging, throw, or type below)</Text>
        ) : (
          visibleEntries.map((e) => <EntryRow key={e.id} entry={e} />)
        )}
      </Box>

      {/* REPL row — wrapped in a `<KeyScope>` so the Input's keystrokes
       *  don't fire the overlay's PgUp/PgDn binds while typing. */}
      <Box
        flexShrink={0}
        borderStyle="round"
        borderColor="magenta"
        borderTop={false}
        borderBottom={false}
        paddingX={1}
      >
        <KeyScope>
          <Box flexGrow={1}>
            <Input
              value={input}
              onChange={setInput}
              onSubmit={onSubmit}
              onCancel={close}
              placeholder="inject code — e.g. process.uptime() or await fetch('…')"
              prefix="❯ "
              accentColor="magenta"
              border={false}
              flex
              autoFocus
            />
          </Box>
        </KeyScope>
      </Box>

      <Box flexShrink={0}>
        <Text color="magenta">╰{'─'.repeat(Math.max(0, columns - 2))}╯</Text>
      </Box>
    </Box>
  );
}

function EntryRow({ entry }: Readonly<{ entry: DebugEntry }>): React.ReactElement {
  const time = new Date(entry.timestamp).toISOString().slice(11, 19);
  const color = LEVEL_COLOR[entry.level];
  const label = LEVEL_LABEL[entry.level];
  return (
    <Box>
      <Text dimColor>{time} </Text>
      <Text color={color}>[{label}] </Text>
      <Box flexGrow={1}>
        <Text color={entry.level === 'error' ? 'red' : undefined}>{entry.text}</Text>
      </Box>
    </Box>
  );
}
