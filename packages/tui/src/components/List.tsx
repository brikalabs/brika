/**
 * `<List>` + `<ListItem>` — arrow-navigable, mouse-clickable
 * selection list. Same composition shape as `<Search>` minus the
 * input field:
 *
 *   <List
 *     value={focused}
 *     onValueChange={setFocused}
 *     onSelect={(id) => openDetails(id)}
 *   >
 *     {plugins.map((p) => (
 *       <ListItem key={p.uid} value={p.uid}>
 *         <Text bold>{p.displayName}</Text>
 *         <Text dimColor> v{p.version}</Text>
 *       </ListItem>
 *     ))}
 *   </List>
 *
 * Interactions:
 *   - `↑` / `↓`       move focus
 *   - `Home` / `End`  jump to first / last  (not yet bound — TODO)
 *   - `Enter`         calls `onSelect(value)` against the focused item
 *   - **Mouse click** on a row focuses + selects it
 *
 * Controlled by `value` / `onValueChange` (or uncontrolled with
 * `defaultValue`). When no value is given and at least one item
 * registers, focus auto-snaps to the first item. Each `<ListItem>`
 * supplies a `value` that becomes its identity; the React `key` is
 * separate but typically the same string.
 *
 * `<List>` does NOT capture input (no inner `<Input>`), so global
 * shell shortcuts keep working alongside it.
 */

import { Box, type DOMElement, Text, useFocus } from 'ink';
import type React from 'react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useKey } from '../keys/useKey';
import { hitTest, readBounds } from '../mouse/useBounds';
import { type MouseEvent, useMouse } from '../mouse/useMouse';

interface ListItemEntry {
  readonly value: string;
}

interface ListContextValue {
  readonly value: string | null;
  readonly setValue: (v: string) => void;
  readonly registerItem: (entry: ListItemEntry) => () => void;
  readonly items: ReadonlyArray<ListItemEntry>;
  readonly select: (v: string) => void;
}

const ListContext = createContext<ListContextValue | null>(null);

function useListContext(component: string): ListContextValue {
  const ctx = useContext(ListContext);
  if (!ctx) {
    throw new Error(`<${component}> must be rendered inside a <List>`);
  }
  return ctx;
}

export interface ListProps {
  /** Controlled focused value. */
  readonly value?: string;
  /** Default focused value (uncontrolled). */
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  /** Fired on `Enter` against the focused item. */
  readonly onSelect?: (value: string) => void;
  readonly children?: ReactNode;
}

export function List({
  value,
  defaultValue,
  onValueChange,
  onSelect,
  children,
}: Readonly<ListProps>): React.ReactElement {
  const [internalValue, setInternalValue] = useState<string | null>(defaultValue ?? null);
  const [items, setItems] = useState<ReadonlyArray<ListItemEntry>>([]);

  const current = value ?? internalValue;

  const onSelectRef = useRef<typeof onSelect>(onSelect);
  onSelectRef.current = onSelect;

  const setValue = useCallback(
    (v: string) => {
      if (value === undefined) {
        setInternalValue(v);
      }
      onValueChange?.(v);
    },
    [value, onValueChange]
  );

  const registerItem = useCallback((entry: ListItemEntry): (() => void) => {
    setItems((prev) => {
      if (prev.some((it) => it.value === entry.value)) {
        return prev;
      }
      return [...prev, entry];
    });
    return () => {
      setItems((prev) => prev.filter((it) => it.value !== entry.value));
    };
  }, []);

  // Auto-focus first item when uncontrolled and nothing's focused.
  useEffect(() => {
    if (value !== undefined) {
      return;
    }
    if (items.length === 0) {
      return;
    }
    if (current === null || !items.some((it) => it.value === current)) {
      const first = items[0];
      if (first) {
        setInternalValue(first.value);
      }
    }
  }, [value, items, current]);

  const focusIdx = useMemo(() => {
    if (current === null) {
      return -1;
    }
    return items.findIndex((it) => it.value === current);
  }, [items, current]);

  const move = useCallback(
    (delta: number) => {
      if (items.length === 0) {
        return;
      }
      const cur = focusIdx === -1 ? 0 : focusIdx;
      const next = items[(cur + delta + items.length) % items.length];
      if (next) {
        setValue(next.value);
      }
    },
    [items, focusIdx, setValue]
  );

  const select = useCallback((v: string) => {
    onSelectRef.current?.(v);
  }, []);

  useKey('upArrow', () => move(-1), items.length > 0);
  useKey('downArrow', () => move(1), items.length > 0);
  useKey(
    'return',
    () => {
      const focused = items[focusIdx];
      if (focused) {
        select(focused.value);
      }
    },
    items.length > 0 && Boolean(onSelect)
  );

  const ctx = useMemo<ListContextValue>(
    () => ({ value: current, setValue, registerItem, items, select }),
    [current, setValue, registerItem, items, select]
  );

  return (
    <ListContext.Provider value={ctx}>
      <Box flexDirection="column">{children}</Box>
    </ListContext.Provider>
  );
}

export interface ListItemProps {
  /** Identifier for focus + selection callbacks. */
  readonly value: string;
  readonly children?: ReactNode;
}

export function ListItem({ value, children }: Readonly<ListItemProps>): React.ReactElement {
  const ctx = useListContext('ListItem');
  const { registerItem, value: focused, setValue, select } = ctx;
  const isFocused = focused === value;

  // Register the item so List's keybinds can walk the set.
  useEffect(() => registerItem({ value }), [registerItem, value]);

  // Tab-focus integration: each item can grab keyboard focus via ink's
  // focus manager, letting the user navigate purely with Tab if they
  // prefer (in addition to arrow keys).
  useFocus({ id: `list-${value}`, isActive: false });

  // Mouse: click on a row focuses it and fires onSelect once. Bounds
  // are read on-demand via `readBounds` so this hook adds zero
  // per-render work — handy when a list has hundreds of items.
  const boxRef = useRef<DOMElement>(null);
  const handleMouse = useCallback(
    (e: MouseEvent) => {
      if (e.button !== 'left') {
        return;
      }
      const bounds = readBounds(boxRef.current);
      if (!bounds || !hitTest(bounds, e)) {
        return;
      }
      if (e.action === 'down') {
        setValue(value);
      } else if (e.action === 'click') {
        select(value);
      }
    },
    [setValue, select, value]
  );
  useMouse(handleMouse);

  return (
    <Box ref={boxRef}>
      <Text color={isFocused ? 'cyan' : undefined}>{isFocused ? '▸ ' : '  '}</Text>
      <Box>{children}</Box>
    </Box>
  );
}
