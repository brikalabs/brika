import { Button } from '@brika/tui';
import { Box } from 'ink';
import type React from 'react';

interface InstalledActionsProps {
  readonly isFiltering: boolean;
  readonly onFilter: () => void;
  readonly onClear: () => void;
  readonly onSearch: () => void;
}

/** Discoverable action bar replacing the legacy text hint row — `[/]
 *  filter`, `[→] search` are always visible, `[c] clear` joins them
 *  when a filter is active. ↑↓/Enter stay handled by `<List>` itself
 *  (the `▸` cursor is the visual indicator). */
export function InstalledActions({
  isFiltering,
  onFilter,
  onClear,
  onSearch,
}: Readonly<InstalledActionsProps>): React.ReactElement {
  return (
    <Box flexShrink={0} marginTop={1}>
      <Button shortcut="/" onPress={onFilter}>
        {isFiltering ? 'new filter' : 'filter'}
      </Button>
      {isFiltering ? (
        <Button shortcut="c" variant="warning" onPress={onClear}>
          clear
        </Button>
      ) : null}
      <Button shortcut="rightArrow" onPress={onSearch}>
        search
      </Button>
    </Box>
  );
}
