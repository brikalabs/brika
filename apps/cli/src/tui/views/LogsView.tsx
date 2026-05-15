/**
 * Logs section — live tail from `/api/stream/logs` (SSE). Renders the
 * in-memory ring buffer first, then appends each event as it arrives.
 * Uses `@brika/tui`'s `LogPane` for the rolling-window view and
 * `useSearch` (also from `@brika/tui`) for `/`-driven highlighting.
 */

import {
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

function formatEvent(e: LogEventDto): string {
  const ts = new Date(e.ts).toISOString().slice(11, 19);
  const level = e.level.padEnd(5);
  const source = e.pluginName ? `${e.source}/${e.pluginName}` : e.source;
  return `${ts}  ${level} ${source.padEnd(20)} ${e.message}`;
}

export function LogsView(): React.ReactElement {
  const cli = useCli();
  const [lines, setLines] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [streamError, setStreamError] = useState<string | null>(null);
  const { chromeHeight } = useTuiShell();
  const layout = useLayoutDimensions(lines.length, chromeHeight + 4);
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

  useKey('upArrow', () => scroll.scrollUp(1));
  useKey('downArrow', () => scroll.scrollDown(1));
  useKey('pageUp', () => scroll.scrollUp(layout.pageSize));
  useKey('pageDown', () => scroll.scrollDown(layout.pageSize));
  useKey('G', () => scroll.goLive());
  useKey('/', () => search.enter(), search.mode !== 'searching');
  useKey('n', () => search.next(), Boolean(search.query));
  useKey('N', () => search.prev(), Boolean(search.query));

  if (cli.hub.state !== 'running') {
    return <NotConnected title="Logs" />;
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Logs </Text>
        <Text dimColor>{lines.length}</Text>
        {streamError && <Text color="red"> · {streamError}</Text>}
      </Box>
      <LogPane
        label="hub"
        lines={lines}
        revision={revision}
        visible={layout.visible}
        scrollFromBottom={scroll.offset}
        maxScroll={layout.maxScroll}
        searchQuery={search.query}
        currentMatchLine={search.currentMatchLine}
      />
      <Box marginTop={1}>
        <Text dimColor>↑↓ scroll · G live · / search · n next · N prev</Text>
      </Box>
    </Box>
  );
}
