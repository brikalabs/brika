import { useRouter, useShortcut } from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import type { PluginListItem } from '../../../../shared/cli/api/plugins';
import { FilterDraft, filterPlugins } from './FilterDraft';
import { InstalledActions } from './InstalledActions';
import { PluginRows } from './PluginRows';

export function InstalledList({
  items: allItems,
  loading,
  error,
  onOpen,
}: Readonly<{
  items: ReadonlyArray<PluginListItem>;
  loading: boolean;
  error: string | null;
  onOpen: (uid: string) => void;
}>): React.ReactElement {
  const [focusedUid, setFocusedUid] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState(false);
  const [filter, setFilter] = useState('');
  const router = useRouter();

  const items = useMemo(() => filterPlugins(allItems, filter), [allItems, filter]);
  const isFiltering = filter.length > 0;
  const openFilter = useCallback(() => setFilterMode(true), []);
  const clearFilter = useCallback(() => {
    setFilter('');
    setFocusedUid(null);
  }, []);
  const goSearch = useCallback(
    () => router.navigatePath([{ name: 'plugins' }, { name: 'search' }]),
    [router]
  );

  useShortcut('/', openFilter, !filterMode);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexShrink={0}>
        <Text dimColor>{items.length} installed</Text>
        {filter ? (
          <>
            <Text dimColor> · filter </Text>
            <Text color="cyan">/{filter}/</Text>
          </>
        ) : null}
        {loading ? <Text dimColor> · loading…</Text> : null}
      </Box>
      {error ? (
        <Box flexShrink={0}>
          <Text color="red">✗ {error}</Text>
        </Box>
      ) : null}

      {filterMode ? (
        <Box marginBottom={1}>
          <FilterDraft
            initial={filter}
            onCommit={(v) => {
              setFilter(v);
              setFilterMode(false);
              setFocusedUid(null);
            }}
            onCancel={() => setFilterMode(false)}
          />
        </Box>
      ) : null}

      <PluginRows
        items={items}
        allCount={allItems.length}
        focusedUid={focusedUid}
        onFocusChange={setFocusedUid}
        onSelect={onOpen}
      />

      {filterMode ? null : (
        <InstalledActions
          isFiltering={isFiltering}
          onFilter={openFilter}
          onClear={clearFilter}
          onSearch={goSearch}
        />
      )}
    </Box>
  );
}
