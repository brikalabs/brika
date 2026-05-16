import {
  Badge,
  EmptyState,
  EmptyStateDescription,
  EmptyStateTitle,
  List,
  ListItem,
  useMeasure,
} from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { PluginListItem } from '../../../../shared/cli/api/plugins';
import { STATUS_VARIANT } from '../../constants';

interface PluginRowsProps {
  readonly items: ReadonlyArray<PluginListItem>;
  readonly allCount: number;
  readonly focusedUid: string | null;
  readonly onFocusChange: (uid: string) => void;
  readonly onSelect?: (uid: string) => void;
}

export function PluginRows({
  items,
  allCount,
  focusedUid,
  onFocusChange,
  onSelect,
}: Readonly<PluginRowsProps>): React.ReactElement {
  const [windowRef, windowSize] = useMeasure();
  const focusedIdx = useMemo(
    () => (focusedUid ? items.findIndex((p) => p.uid === focusedUid) : -1),
    [items, focusedUid]
  );
  const visibleRows = Math.max(1, windowSize.height);
  const [offset, setOffset] = useState(0);

  // Keep the cursor row inside the window — scroll the slice when the
  // user arrows past either edge. Re-clamp when the item count shrinks
  // (filter narrows, uninstall removes a row).
  useEffect(() => {
    setOffset((cur) => {
      const maxOffset = Math.max(0, items.length - visibleRows);
      const clamped = Math.min(cur, maxOffset);
      if (focusedIdx < 0) {
        return clamped;
      }
      if (focusedIdx < clamped) {
        return focusedIdx;
      }
      if (focusedIdx >= clamped + visibleRows) {
        return focusedIdx - visibleRows + 1;
      }
      return clamped;
    });
  }, [focusedIdx, visibleRows, items.length]);

  if (allCount === 0) {
    return (
      <EmptyState>
        <EmptyStateTitle>No plugins yet</EmptyStateTitle>
        <EmptyStateDescription>Press → to switch to Search and install one.</EmptyStateDescription>
      </EmptyState>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState>
        <EmptyStateTitle>Filter matches nothing</EmptyStateTitle>
        <EmptyStateDescription>
          Press <Text bold>/</Text> then Enter on an empty input to clear.
        </EmptyStateDescription>
      </EmptyState>
    );
  }

  const clipped = items.length > visibleRows;
  const atTop = offset === 0;
  const atBot = offset + visibleRows >= items.length;

  return (
    <Box flexDirection="column" flexGrow={1} flexShrink={1} flexBasis={0} minHeight={1}>
      <Box ref={windowRef} overflow="hidden" flexGrow={1} flexShrink={1}>
        {/* flexShrink=0 prevents Yoga from collapsing the inner box
         *  when its negative marginTop pushes the bottom past the
         *  window — same trick as <ScrollArea>. */}
        <Box flexDirection="column" flexShrink={0} marginTop={-offset}>
          <List
            autoFocus
            id="plugins-installed-list"
            value={focusedUid ?? undefined}
            onValueChange={onFocusChange}
            onSelect={onSelect}
          >
            {items.map((p) => {
              const isFocusedRow = focusedUid === p.uid;
              return (
                <ListItem key={p.uid} value={p.uid}>
                  <Text bold={isFocusedRow}>{p.displayName ?? p.name}</Text>
                  <Text dimColor> v{p.version} </Text>
                  <Badge variant={STATUS_VARIANT[p.status] ?? 'secondary'}>{p.status}</Badge>
                </ListItem>
              );
            })}
          </List>
        </Box>
      </Box>
      {clipped && (
        <Box flexShrink={0}>
          <Text dimColor>
            {`${atTop ? '·' : '↑'} ${atBot ? '·' : '↓'}  ${offset + 1}-${Math.min(items.length, offset + visibleRows)}/${items.length}`}
          </Text>
        </Box>
      )}
    </Box>
  );
}
