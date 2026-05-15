/**
 * Logs section — live tail from `/api/stream/logs` (SSE). Renders the
 * in-memory ring buffer first, then appends each event as it arrives.
 *
 * Layout
 *   ┌─ Heading ──────────── 47 logs · stream error? ─┐
 *   │ search bar (only while searching)              │
 *   ├─ LogPane (fills) ──────────────────────────────┤
 *   │ 12:01:00  info   hub  hub started              │
 *   │ 12:01:01  info   plugin  …                     │
 *   ├─ action buttons (when paused / searching) ─────┤
 *   │ [G] live  [n] next  [N] prev  [c] clear        │
 *   └─ HintBar — always ─────────────────────────────┘
 *
 * Two parallel arrays back the pane:
 *   - `lines: string[]` — what the search index walks
 *   - `events: LogEventDto[]` — what the colored renderer pulls fields
 *     from at paint time (timestamp dim, level by severity, source cyan)
 * They're appended together so `lines[i]` and `events[i]` always agree.
 */

import {
  Button,
  FocusScope,
  Heading,
  Hint,
  HintBar,
  Input,
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
/** Vertical space LogsView reserves around the LogPane. LogPane now
 *  measures its own body, so this only needs to be a rough estimate
 *  for `useLayoutDimensions.pageSize` on the first frame. */
const VIEW_CHROME = 6;

function formatEvent(e: LogEventDto): string {
  const ts = new Date(e.ts).toISOString().slice(11, 19);
  const level = e.level.padEnd(5);
  const source = e.pluginName ? `${e.source}/${e.pluginName}` : e.source;
  return `${ts}  ${level} ${source.padEnd(20)} ${e.message}`;
}

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
  const [searchDraft, setSearchDraft] = useState('');
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
  // scroll, not a discrete clickable action.
  useKey('upArrow', () => scroll.scrollUp(1));
  useKey('downArrow', () => scroll.scrollDown(1));
  useKey('pageUp', () => scroll.scrollUp(layout.pageSize));
  useKey('pageDown', () => scroll.scrollDown(layout.pageSize));
  useKey('ctrl+u', () => scroll.scrollUp(layout.pageSize));
  useKey('ctrl+d', () => scroll.scrollDown(layout.pageSize));
  // `/` opens the search Input; `G` / `n` / `N` / `c` live on Buttons below.
  useKey(
    '/',
    () => {
      setSearchDraft(search.query);
      search.enter();
    },
    cli.hub.state === 'running' && search.mode !== 'searching'
  );

  if (cli.hub.state !== 'running') {
    return <NotConnected title="Logs" />;
  }

  const searching = search.mode === 'searching';
  const showActions = scroll.offset !== null || Boolean(search.query) || searching;
  const subtitle = buildSubtitle(lines.length, search);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexShrink={0}>
        <Heading
          subtitle={subtitle}
          meta={streamError ? <Text color="red">{streamError}</Text> : null}
        >
          Logs
        </Heading>
      </Box>

      {searching ? (
        <Box flexShrink={0} marginBottom={1}>
          <Input
            value={searchDraft}
            onChange={setSearchDraft}
            onSubmit={(value) => {
              setSearchDraft(value);
              // commit through useSearch's input buffer
              applyQuery(search, value);
            }}
            onCancel={() => {
              search.cancel();
              setSearchDraft('');
            }}
            placeholder="search logs — / to open, Enter to commit, Esc to cancel"
            prefix="/ "
            accentColor="cyan"
            flex
          />
        </Box>
      ) : null}

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

      {showActions ? (
        <FocusScope autoFocus>
          <Box flexShrink={0} marginTop={1}>
            {scroll.offset !== null ? (
              <Button shortcut="G" variant="success" onPress={() => scroll.goLive()}>
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
                <Button
                  shortcut="c"
                  variant="warning"
                  onPress={() => {
                    search.clear();
                    setSearchDraft('');
                  }}
                >
                  clear
                </Button>
              </>
            ) : null}
          </Box>
        </FocusScope>
      ) : null}

      <Box flexShrink={0}>
        <HintBar>
          <Hint k="↑↓">scroll</Hint>
          <Hint k="^U/^D">page</Hint>
          {!searching ? (
            <Hint k="/" accent="info">
              search
            </Hint>
          ) : null}
        </HintBar>
      </Box>
    </Box>
  );
}

/** Compose the subtitle line. Includes line count, search-match info,
 *  and active-query echo so the user always knows what they're seeing. */
function buildSubtitle(total: number, search: ReturnType<typeof useSearch>): string {
  if (search.query) {
    const n = search.matches.length;
    const pos = n === 0 ? '0' : `${search.currentMatchIdx + 1}/${n}`;
    return `${total} lines · /${search.query}/ · match ${pos}`;
  }
  if (search.mode === 'searching') {
    return `${total} lines · searching…`;
  }
  return `${total} lines`;
}

/** Commit a query into `useSearch`. The hook expects the query to be
 *  built character-by-character via `.type()`, but the new search
 *  Input gives us the whole string at once on submit — apply by
 *  clearing the input buffer and replaying. */
function applyQuery(search: ReturnType<typeof useSearch>, value: string): void {
  // Drain whatever's in the hook's internal `input` then push the new
  // value through, then commit.
  const cur = search.input;
  for (let i = 0; i < cur.length; i++) {
    search.backspace();
  }
  for (const ch of value) {
    search.type(ch);
  }
  search.commit();
}
