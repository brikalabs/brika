import { Button, useScroll } from '@brika/tui';
import { Box } from 'ink';
import type React from 'react';
import type { LogSearchControls } from './search/useLogSearch';

interface ActionsRowProps {
  readonly search: LogSearchControls;
  readonly isSearching: boolean;
  readonly liveScroll: ReturnType<typeof useScroll>;
  readonly onSearch: () => void;
}

/**
 * Always-visible action bar — chips ARE the keyboard discovery so the
 * user never has to wonder what `/` or `G` does. The set adapts to
 * the current mode but `[↑]` / `[↓]` / `[/]` are always there:
 *
 *   - `[↑]` / `[↓]` — scroll the live tail, or jump to the prev /
 *                     next match while a search is active.
 *   - `[/]`          — open the search input.
 *   - `[G]`          — jump back to live tail (paused mode only).
 *   - `[n] [N] [c]` — match nav + clear (search mode only).
 */
export function ActionsRow({
  search,
  isSearching,
  liveScroll,
  onSearch,
}: Readonly<ActionsRowProps>): React.ReactElement {
  return (
    <Box flexShrink={0} marginTop={1}>
      <ArrowButtons search={search} isSearching={isSearching} liveScroll={liveScroll} />
      <Button shortcut="/" onPress={onSearch}>
        {isSearching ? 'new search' : 'search'}
      </Button>
      <ModeButtons search={search} isSearching={isSearching} liveScroll={liveScroll} />
    </Box>
  );
}

interface ArrowsProps {
  readonly search: LogSearchControls;
  readonly isSearching: boolean;
  readonly liveScroll: ReturnType<typeof useScroll>;
}

function ArrowButtons({
  search,
  isSearching,
  liveScroll,
}: Readonly<ArrowsProps>): React.ReactElement {
  const onUp = isSearching ? search.prev : () => liveScroll.scrollUp(1);
  const onDown = isSearching ? search.next : () => liveScroll.scrollDown(1);
  const enabled = isSearching ? search.results.length > 1 : true;
  return (
    <>
      <Button shortcut="upArrow" enabled={enabled} onPress={onUp}>
        up
      </Button>
      <Button shortcut="downArrow" enabled={enabled} onPress={onDown}>
        down
      </Button>
    </>
  );
}

function ModeButtons({
  search,
  isSearching,
  liveScroll,
}: Readonly<ArrowsProps>): React.ReactElement | null {
  if (isSearching) {
    return <SearchActions search={search} />;
  }
  if (liveScroll.offset === null) {
    return null;
  }
  return (
    <Button shortcut="G" variant="success" onPress={() => liveScroll.goLive()}>
      live
    </Button>
  );
}

function SearchActions({
  search,
}: Readonly<{ search: LogSearchControls }>): React.ReactElement {
  const hasMany = search.results.length > 1;
  return (
    <>
      <Button shortcut="n" enabled={hasMany} onPress={search.next}>
        next
      </Button>
      <Button shortcut="N" enabled={hasMany} onPress={search.prev}>
        prev
      </Button>
      <Button shortcut="c" variant="warning" onPress={search.clear}>
        clear
      </Button>
    </>
  );
}
