/**
 * `<MenuBar>` — responsive horizontal top-nav strip.
 *
 *   ┃ [1] Dashboard ┃  [2] Plugins   [3] Workflows   [4] Logs   …
 *   ━━━━━━━━━━━━━━━━
 *
 * Renders items as data so consumers don't have to hand-render each
 * one. The active item is visually "raised" — bold accent label with
 * a thick underline — while inactive items stay readable but quiet.
 *
 * Responsiveness: each label is `wrap="truncate-end"` so Ink never
 * splits a label mid-word onto a second row. When the full row of
 * labels doesn't fit the terminal, the bar collapses to compact mode
 * — chips only (`[1] [2] [3] …`) with the active chip annotated by
 * its label after it. This keeps the bar to a single visual row at
 * every width.
 *
 * Mouse: every item is clickable. Hits are filtered against each
 * item's own bounding box so the active region matches the visible
 * label + underline column exactly — no slop into the gutter between
 * tabs.
 *
 *   <MenuBar
 *     items={[
 *       { key: 'dashboard', label: 'Dashboard', hotkey: '1' },
 *       { key: 'plugins',   label: 'Plugins',   hotkey: '2' },
 *     ]}
 *     active="dashboard"
 *     onSelect={(k) => router.navigate(k)}
 *   />
 */

import { Box, type DOMElement, Text } from 'ink';
import type React from 'react';
import { useRef } from 'react';
import { useClickable } from '../mouse/useClickable';
import { useTerminalSize } from '../state/useTerminalSize';

export interface MenuBarItem<K extends string = string> {
  readonly key: K;
  readonly label: string;
  /** Optional single-letter hotkey, printed as a chip in front of the label. */
  readonly hotkey?: string;
}

export interface MenuBarProps<K extends string = string> {
  readonly items: ReadonlyArray<MenuBarItem<K>>;
  readonly active: K;
  readonly onSelect?: (key: K) => void;
  /** Color used to highlight the active item. Defaults to `cyan`. */
  readonly accent?: string;
  /** Reserve this many extra columns when deciding if labels fit
   *  (e.g. shell paddings + outer frame). Defaults to 4. */
  readonly reservedColumns?: number;
}

/** Cells between items (gap + 1 for safety). */
const ITEM_GAP = 2;

function fullModeWidth(items: ReadonlyArray<MenuBarItem>): number {
  let total = 0;
  items.forEach((item, i) => {
    const hotkeyWidth = item.hotkey ? `[${item.hotkey}] `.length : 0;
    total += hotkeyWidth + item.label.length;
    if (i < items.length - 1) {
      total += ITEM_GAP;
    }
  });
  return total;
}

export function MenuBar<K extends string = string>({
  items,
  active,
  onSelect,
  accent = 'cyan',
  reservedColumns = 4,
}: Readonly<MenuBarProps<K>>): React.ReactElement {
  const { columns } = useTerminalSize();
  const available = Math.max(0, columns - reservedColumns);
  const compact = fullModeWidth(items) > available;

  if (compact) {
    return <CompactMenuBar items={items} active={active} onSelect={onSelect} accent={accent} />;
  }

  return (
    <Box>
      {items.map((item, i) => (
        <Box key={item.key} marginRight={i === items.length - 1 ? 0 : ITEM_GAP}>
          <MenuBarItemView
            item={item}
            active={item.key === active}
            accent={accent}
            onPress={onSelect ? () => onSelect(item.key) : undefined}
          />
        </Box>
      ))}
    </Box>
  );
}

interface MenuBarItemViewProps {
  readonly item: MenuBarItem;
  readonly active: boolean;
  readonly accent: string;
  readonly onPress?: () => void;
}

function MenuBarItemView({
  item,
  active,
  accent,
  onPress,
}: Readonly<MenuBarItemViewProps>): React.ReactElement {
  const ref = useRef<DOMElement>(null);
  useClickable(ref, onPress);
  const labelWidth = (item.hotkey ? `[${item.hotkey}] ` : '').length + item.label.length;
  return (
    <Box ref={ref} flexDirection="column" flexShrink={0}>
      <Box>
        {item.hotkey ? (
          <Text color={active ? accent : undefined} dimColor={!active}>
            [{item.hotkey}]{' '}
          </Text>
        ) : null}
        <Text color={active ? accent : undefined} bold={active}>
          {item.label}
        </Text>
      </Box>
      <Text color={active ? accent : 'gray'} dimColor={!active} bold={active}>
        {(active ? '━' : '─').repeat(labelWidth)}
      </Text>
    </Box>
  );
}

interface CompactMenuBarProps<K extends string = string> {
  readonly items: ReadonlyArray<MenuBarItem<K>>;
  readonly active: K;
  readonly onSelect?: (key: K) => void;
  readonly accent: string;
}

function CompactMenuBar<K extends string = string>({
  items,
  active,
  onSelect,
  accent,
}: Readonly<CompactMenuBarProps<K>>): React.ReactElement {
  const activeItem = items.find((i) => i.key === active);
  return (
    <Box>
      {items.map((item) => (
        <Box key={item.key} marginRight={1} flexShrink={0}>
          <CompactChip
            item={item}
            active={item.key === active}
            accent={accent}
            onPress={onSelect ? () => onSelect(item.key) : undefined}
          />
        </Box>
      ))}
      {activeItem ? (
        <Box marginLeft={1} flexShrink={1}>
          <Text dimColor wrap="truncate-end">
            · {activeItem.label}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}

function CompactChip({
  item,
  active,
  accent,
  onPress,
}: Readonly<MenuBarItemViewProps>): React.ReactElement {
  const ref = useRef<DOMElement>(null);
  useClickable(ref, onPress);
  return (
    <Box ref={ref} flexShrink={0}>
      <Text
        color={active ? accent : undefined}
        bold={active}
        dimColor={!active}
        wrap="truncate-end"
      >
        {item.hotkey ? `[${item.hotkey}]` : item.label}
      </Text>
    </Box>
  );
}
