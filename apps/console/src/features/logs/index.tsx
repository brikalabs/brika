/**
 * Logs section — live tail from `/api/stream/logs` (SSE) with a
 * server-side `/api/logs?search=…` lookup for `/`-search. Pushing the
 * grep into the hub's SQLite store (the same path the web UI uses)
 * keeps the view responsive on big ring buffers and lets results
 * include lines that scrolled out of the live tail.
 *
 * Two modes share the same `<LogPane>`:
 *   - **live**   — SSE stream, `↑↓ / PgUp / Ctrl+U / Ctrl+D` scroll,
 *                  `G` jumps back to live tail.
 *   - **search** — committed query, results from the hub, `n` / `N`
 *                  cycle matches, `c` clears.
 *
 * No page heading and no view-local hint bar: the MenuBar shows the
 * active section, ShellFooter has the global hotkeys, the action
 * buttons' `[shortcut]` chips speak for themselves.
 */

import { LogPane, useLayoutDimensions, useScroll, useShortcut, useTuiShell } from '@brika/tui';
import { Box } from 'ink';
import type React from 'react';
import { useMemo, useState } from 'react';
import type { LogEventDto } from '../../shared/cli/api';
import { NotConnected } from '../../shared/components/NotConnected';
import { useCli } from '../../shared/hooks/useCli';
import { ActionsRow } from './ActionsRow';
import { ColoredLogLine } from './ColoredLogLine';
import { ErrorRow } from './ErrorRow';
import { buildLabel, clamp, formatEvent } from './format';
import { useLiveTail, useScrollKeys, VIEW_CHROME } from './live';
import { SearchEditor, useLogSearch } from './search';

export function LogsView(): React.ReactElement {
  const cli = useCli();
  const { events, lines, revision, streamError } = useLiveTail(cli.hub.state === 'running');
  const [searchDraft, setSearchDraft] = useState('');
  const search = useLogSearch();
  const isSearching = search.query.length > 0;

  // Format search results once per result set — `LogPane` works in
  // string-of-line terms, and the renderer pulls the typed event from
  // a parallel array via `renderLine`.
  const resultLines = useMemo(() => search.results.map(formatEvent), [search.results]);

  // The pane reads from EITHER the live buffer or the search results,
  // depending on mode. Both branches keep the (lines, events) shape so
  // the highlight renderer doesn't have to know which mode it's in.
  const paneLines = isSearching ? resultLines : lines;
  const paneEvents: ReadonlyArray<LogEventDto> = isSearching ? search.results : events;
  const paneLength = paneLines.length;

  const { chromeHeight } = useTuiShell();
  const layout = useLayoutDimensions(paneLength, chromeHeight + VIEW_CHROME);
  const liveScroll = useScroll(layout.maxScroll);

  // In search mode, anchor the view on the current match — recompute
  // `scrollFromBottom` so the highlighted line stays in the bottom
  // third of the window. In live mode, the user drives the scroll
  // via `useScroll` (null = live tail).
  const searchScroll = useMemo(() => {
    if (!isSearching) {
      return null;
    }
    if (paneLength === 0) {
      return 0;
    }
    const anchorOffset = Math.max(2, Math.floor(layout.visible / 3));
    const fromBottom = paneLength - 1 - search.currentIdx - anchorOffset;
    return clamp(fromBottom, 0, layout.maxScroll);
  }, [isSearching, paneLength, search.currentIdx, layout.visible, layout.maxScroll]);
  const scrollFromBottom = isSearching ? searchScroll : liveScroll.offset;

  useScrollKeys(liveScroll, layout.pageSize, !isSearching);
  useShortcut(
    '/',
    () => {
      setSearchDraft(search.query);
      search.enter();
    },
    cli.hub.state === 'running' && search.mode !== 'editing'
  );

  if (cli.hub.state !== 'running') {
    return <NotConnected title="Logs" />;
  }

  const editing = search.mode === 'editing';
  const currentMatchLine = isSearching && paneLength > 0 ? search.currentIdx : null;

  return (
    <Box flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden">
      <ErrorRow message={streamError} />
      <ErrorRow message={search.error ? `search: ${search.error}` : null} />

      <LogPane
        label={buildLabel(search)}
        lines={paneLines}
        revision={isSearching ? search.currentIdx + 1 : revision}
        visible={layout.visible}
        scrollFromBottom={scrollFromBottom}
        maxScroll={layout.maxScroll}
        searchQuery={search.query}
        currentMatchLine={currentMatchLine}
        renderLine={(text, i) => {
          const event = paneEvents[i];
          return event ? <ColoredLogLine event={event} /> : text;
        }}
      />

      {editing ? (
        <SearchEditor
          draft={searchDraft}
          setDraft={setSearchDraft}
          onSubmit={(value) => search.commit(value)}
          onCancel={() => {
            search.cancel();
            setSearchDraft('');
          }}
        />
      ) : (
        <ActionsRow
          search={search}
          isSearching={isSearching}
          liveScroll={liveScroll}
          onSearch={() => {
            setSearchDraft(search.query);
            search.enter();
          }}
        />
      )}
    </Box>
  );
}
