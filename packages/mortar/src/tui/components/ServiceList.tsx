import { List, ListItem, statusColor, statusGlyph } from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import { useMemo, useState } from 'react';
import type { ServiceState } from '../../supervisor';

interface Props {
  readonly services: ReadonlyArray<ServiceState>;
  readonly focusedId: string | null;
  readonly onFocusChange: (id: string) => void;
}

/**
 * Column overhead = `▸ ● ` prefix (4 cells, ▸ and ● are wide CJK-class
 * glyphs counted as 2 cells each in most terminals) + `paddingX` (1
 * each side) + border (1 each side) + a 1-cell safety margin. The
 * `min/max` clamps prevent absurd widths if labels are pathological.
 */
const PREFIX_OVERHEAD = 8;
const MIN_WIDTH = 14;
const MAX_WIDTH = 40;

/**
 * Left column: one row per service with a status dot + label.
 *
 * Backed by `<List>` from `@brika/tui` so the column is a single focus
 * slot in the Tab cycle, navigable with `↑` / `↓` / `j` / `k` while
 * focused, and clickable with the mouse (click selects the service and
 * parks focus here). The outer border switches to bold/cyan when the
 * list owns focus so the user can see at a glance which pane the
 * keyboard is talking to — mirrors the [LogPane] focused styling.
 */
export function ServiceList({
  services,
  focusedId,
  onFocusChange,
}: Readonly<Props>): React.ReactElement {
  const [listFocused, setListFocused] = useState(false);

  const width = useMemo(() => {
    let longest = 'Services'.length;
    for (const svc of services) {
      if (svc.spec.label.length > longest) {
        longest = svc.spec.label.length;
      }
    }
    const target = longest + PREFIX_OVERHEAD;
    if (target < MIN_WIDTH) {
      return MIN_WIDTH;
    }
    if (target > MAX_WIDTH) {
      return MAX_WIDTH;
    }
    return target;
  }, [services]);

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle={listFocused ? 'bold' : 'single'}
      borderColor={listFocused ? 'cyan' : 'gray'}
      paddingX={1}
    >
      <Text bold color={listFocused ? 'cyan' : undefined}>
        Services
      </Text>
      <Box marginTop={1}>
        <List
          value={focusedId ?? undefined}
          onValueChange={onFocusChange}
          onFocusChange={setListFocused}
          autoFocus
        >
          {services.map((svc) => (
            <ListItem key={svc.spec.id} value={svc.spec.id}>
              <Text color={statusColor(svc.status)}>{statusGlyph(svc.status)} </Text>
              {/*
                `wrap="truncate-end"` + `flexShrink` keeps each row to a
                single line. Without it, ink reflows the wrapped portion
                back to the row's left edge — visually unaligned with the
                status dot. Only kicks in when a label exceeds MAX_WIDTH.
              */}
              <Box flexShrink={1}>
                <Text wrap="truncate-end">{svc.spec.label}</Text>
              </Box>
            </ListItem>
          ))}
        </List>
      </Box>
    </Box>
  );
}
