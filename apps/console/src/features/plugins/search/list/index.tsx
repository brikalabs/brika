import {
  Button,
  KeyScope,
  Search,
  SearchEmpty,
  SearchInput,
  SearchItem,
  SearchResults,
  useRouter,
} from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import { useCallback } from 'react';
import type { RegistrySearchResult } from '../../../../shared/cli/api/registry';

interface SearchListProps {
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
  readonly results: ReadonlyArray<RegistrySearchResult>;
  readonly searching: boolean;
  readonly searchError: string | null;
  readonly isInstalled: (r: RegistrySearchResult) => boolean;
  readonly onSelect: (r: RegistrySearchResult) => void;
}

export function SearchList({
  query,
  onQueryChange,
  results,
  searching,
  searchError,
  isInstalled,
  onSelect,
}: Readonly<SearchListProps>): React.ReactElement {
  return (
    // `<KeyScope>` lets the `[←] installed` button's shortcut fire
    // even while the `<SearchInput>` captures keystrokes; without it
    // typing in the query box would suspend the back-to-Installed
    // affordance and the chip would mislead the user.
    <KeyScope>
      <Box flexDirection="column" flexGrow={1}>
        <Search<RegistrySearchResult>
          value={query}
          onValueChange={onQueryChange}
          onSelect={onSelect}
        >
          <SearchInput placeholder="search registry — `@brika/plugin-spotify`, `weather`, …" />
          <SearchResults>
            {results.map((r) => (
              <SearchItem key={`${r.source}:${r.name}`} value={r} itemKey={`${r.source}:${r.name}`}>
                <Text bold>{r.displayName ?? r.name}</Text>
                <Text dimColor> v{r.version}</Text>
                {isInstalled(r) ? <Text color="green"> · installed</Text> : null}
                {r.compatible ? null : <Text color="yellow"> · incompatible</Text>}
                {r.description ? <Text dimColor>{` — ${r.description}`}</Text> : null}
              </SearchItem>
            ))}
          </SearchResults>
          <SearchEmpty>start typing to search the registry</SearchEmpty>
          <SearchStatus
            searching={searching}
            error={searchError}
            query={query}
            resultCount={results.length}
          />
        </Search>
        <SearchTabActions />
      </Box>
    </KeyScope>
  );
}

/** Action bar for the registry-search tab: just `[←] installed`,
 *  always visible. ↑↓ / ↵ / Ctrl+↵ stay handled by `<Search>` itself
 *  (its `▸` cursor on the focused row is the visual indicator), so we
 *  don't repeat them here. */
function SearchTabActions(): React.ReactElement {
  const router = useRouter();
  const goInstalled = useCallback(
    () => router.navigatePath([{ name: 'plugins' }, { name: 'installed' }]),
    [router]
  );
  return (
    <Box flexShrink={0} marginTop={1}>
      <Button shortcut="leftArrow" onPress={goInstalled}>
        installed
      </Button>
    </Box>
  );
}

/** Tiny status strip under the search input — `Search` is pure UI;
 *  view-level "searching…" / "no matches" wording lives next to the
 *  data source that produces them. */
function SearchStatus({
  searching,
  error,
  query,
  resultCount,
}: Readonly<{
  searching: boolean;
  error: string | null;
  query: string;
  resultCount: number;
}>): React.ReactElement | null {
  if (error) {
    return (
      <Box>
        <Text color="red">{error}</Text>
      </Box>
    );
  }
  if (searching) {
    return (
      <Box>
        <Text dimColor>searching…</Text>
      </Box>
    );
  }
  if (query.trim().length > 0 && resultCount === 0) {
    return (
      <Box>
        <Text dimColor>no matches</Text>
      </Box>
    );
  }
  if (resultCount > 0) {
    return (
      <Box>
        <Text dimColor>Enter — open · Ctrl+Enter — install</Text>
      </Box>
    );
  }
  return null;
}
