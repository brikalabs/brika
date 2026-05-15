/**
 * Logs section — live tail from `/api/stream/logs` (SSE). Renders the
 * in-memory ring buffer first, then appends each event as it arrives.
 * Uses `@brika/tui`'s `LogPane` for the rolling-window view and
 * `useSearch` (also from `@brika/tui`) for `/`-driven highlighting.
 *
 * Lines are kept as two parallel arrays:
 *  - `lines: string[]` — what the search index walks
 *  - `events: LogEventDto[]` — what the colored renderer pulls fields
 *    from at paint time (timestamp dim, level by severity, source cyan)
 * They're appended together so `lines[i]` and `events[i]` always agree.
 */

import {
  Button,
  Heading,
  Hint,
  HintBar,
  LogPane,
  useKey,
  useLayoutDimensions,
  useScroll,
  useSearch,
  useTuiShell,
} from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import { useEffect, useState } from 'react';
import { fetchRecentLogs, type LogEventDto } from '../../cli/hub-api';
import { hubFetch } from '../../cli/hub-client';
import { streamSseEvents } from '../../cli/sse';
import { NotConnected } from '../components/NotConnected';
import { useCli } from '../useCli';

const RING_BUFFER_LINES = 5_000;
/** Vertical space LogsView reserves around the LogPane: title row (2),
 *  pane border + label + top margin (4), key-hint footer (2). The
 *  conditional action-buttons row (live / next / prev) adds 2 more
 *  when visible, but LogPane now measures its own body so the slice
 *  size stays correct regardless. */
const VIEW_CHROME = 8;

function formatEvent(e: LogEventDto): string {
  const ts = new Date(e.ts).toISOString().slice(11, 19);
  const level = e.level.padEnd(5);
  const source = e.pluginName ? `${e.source}/${e.pluginName}` : e.source;
  return `${ts}  ${level} ${source.padEnd(20)} ${e.message}`;
}

/**
 * Map a log level to its display color. Anything we don't recognise
 * renders default (white-on-default) so unknown levels still read.
 */
function levelColor(level: string): string | undefined {
  switch (level.toLowerCase()) {
    case 'fatal':
    case 'error':
      return 'red';
    case 'warn':
    case 'warning':
      return 'yellow';
    case 'info':
      return 'cyan';
    case 'debug':
    case 'trace':
      return 'gray';
    default:
      return undefined;
  }
}

function ColoredLogLine({ event }: Readonly<{ event: LogEventDto }>): React.ReactElement {
  const ts = new Date(event.ts).toISOString().slice(11, 19);
  const level = event.level.padEnd(5);
  const source = (event.pluginName ? `${event.source}/${event.pluginName}` : event.source).padEnd(
    20
  );
  return (
    <>
      <Text dimColor>{ts}</Text>
      <Text>{'  '}</Text>
      <Text color={levelColor(event.level)} bold>
        {level}
      </Text>
      <Text> </Text>
      <Text color="cyan" dimColor>
        {source}
      </Text>
      <Text> {event.message}</Text>
    </>
  );
}

export function LogsView(): React.ReactElement {
  const cli = useCli();
  const [events, setEvents] = useState<LogEventDto[]>([]);
  const [lines, setLines] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [streamError, setStreamError] = useState<string | null>(null);
  const { chromeHeight } = useTuiShell();
  const layout = useLayoutDimensions(lines.length, chromeHeight + VIEW_CHROME);
  const scroll = useScroll(layout.maxScroll);
  const search = useSearch(lines, 'brika-logs');

  // Hydrate from the ring buffer, then attach SSE.
  useEffect(() => {
    if (cli.hub.state !== 'running') {
      return;
    }
    let cancelled = false;

    void (async () => {
      try {
        const recent = await fetchRecentLogs();
        if (cancelled) {
          return;
        }
        setEvents(recent);
        setLines(recent.map(formatEvent));
        setRevision((r) => r + 1);
      } catch (e) {
        if (!cancelled) {
          setStreamError(e instanceof Error ? e.message : String(e));
        }
      }
    })();

    const controller = new AbortController();
    void (async () => {
      try {
        const res = await hubFetch('/api/stream/logs', { signal: controller.signal });
        if (cancelled || !res.ok) {
          return;
        }
        for await (const event of streamSseEvents<LogEventDto>(res)) {
          if (cancelled) {
            return;
          }
          setEvents((prev) => {
            const next = [...prev, event];
            return next.length > RING_BUFFER_LINES
              ? next.slice(next.length - RING_BUFFER_LINES)
              : next;
          });
          setLines((prev) => {
            const next = [...prev, formatEvent(event)];
            return next.length > RING_BUFFER_LINES
              ? next.slice(next.length - RING_BUFFER_LINES)
              : next;
          });
          setRevision((r) => r + 1);
        }
      } catch (e) {
        if (!cancelled && !(e instanceof Error && e.name === 'AbortError')) {
          setStreamError(e instanceof Error ? e.message : String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [cli.hub.state]);

  // Scroll keys stay as `useKey` — they drive the pane's internal
  // scroll, not a discrete clickable action. PgUp/PgDn for keyboards
  // that have them; Ctrl+U/Ctrl+D as the Mac-friendly equivalents.
  useKey('upArrow', () => scroll.scrollUp(1));
  useKey('downArrow', () => scroll.scrollDown(1));
  useKey('pageUp', () => scroll.scrollUp(layout.pageSize));
  useKey('pageDown', () => scroll.scrollDown(layout.pageSize));
  useKey('ctrl+u', () => scroll.scrollUp(layout.pageSize));
  useKey('ctrl+d', () => scroll.scrollDown(layout.pageSize));
  useKey('/', () => search.enter(), search.mode !== 'searching');
  // `G` / `n` / `N` are wired through their footer Buttons below.

  if (cli.hub.state !== 'running') {
    return <NotConnected title="Logs" />;
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Heading
        subtitle={`${lines.length} lines`}
        meta={streamError ? <Text color="red">{streamError}</Text> : null}
      >
        Logs
      </Heading>
      <LogPane
        label="hub"
        lines={lines}
        revision={revision}
        visible={layout.visible}
        scrollFromBottom={scroll.offset}
        maxScroll={layout.maxScroll}
        searchQuery={search.query}
        currentMatchLine={search.currentMatchLine}
        renderLine={(_text, i) => {
          const event = events[i];
          return event ? <ColoredLogLine event={event} /> : _text;
        }}
      />
      {(scroll.offset !== null || Boolean(search.query)) && (
        <Box flexShrink={0} marginTop={1}>
          {scroll.offset !== null ? (
            <Button shortcut="G" onPress={() => scroll.goLive()}>
              live
            </Button>
          ) : null}
          {search.query ? (
            <>
              <Button shortcut="n" onPress={() => search.next()}>
                next
              </Button>
              <Button shortcut="N" onPress={() => search.prev()}>
                prev
              </Button>
            </>
          ) : null}
        </Box>
      )}
      <Box flexShrink={0}>
        <HintBar>
          <Hint k="↑↓">scroll</Hint>
          <Hint k="^U/^D">page</Hint>
          <Hint k="/" accent="info">
            search
          </Hint>
        </HintBar>
      </Box>
    </Box>
  );
}
