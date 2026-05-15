/**
 * `<List>` + `<ListItem>` — arrow-navigable, mouse-clickable
 * selection list. Same composition shape as `<Search>` minus the
 * input field:
 *
 *   <List
 *     value={focused}
 *     onValueChange={setFocused}
 *     onSelect={(id) => openDetails(id)}
 *     autoFocus
 *   >
 *     {plugins.map((p) => (
 *       <ListItem key={p.uid} value={p.uid}>
 *         <Text bold>{p.displayName}</Text>
 *         <Text dimColor> v{p.version}</Text>
 *       </ListItem>
 *     ))}
 *   </List>
 *
 * Focus model
 *   - `<List>` is a single focus slot (not one slot per item).
 *   - Arrow keys + Enter fire only while the list has focus, so two
 *     focusable regions on screen (list + readme scroller, list +
 *     details pane, etc.) don't double-fire on the same `↑`/`↓`.
 *   - Tab in / click to take focus. `▸` glyph reads brighter when the
 *     list is focused, dimmer when it isn't.
 *
 * Interactions:
 *   - `↑` / `↓`       move focus (while List has focus)
 *   - `Enter`         calls `onSelect(value)` against the focused item
 *   - **Mouse click** on a row focuses the list + selects it
 *
 * Controlled by `value` / `onValueChange` (or uncontrolled with
 * `defaultValue`). When no value is given and at least one item
 * registers, focus auto-snaps to the first item.
 */

import { Box, type DOMElement, Text, useFocus, useFocusManager } from 'ink';
import type React from 'react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
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
  /** True when the parent `<List>` currently owns focus. ListItem uses
   *  this to brighten its leading glyph so the user can tell which
   *  selectable region is active. */
  readonly listFocused: boolean;
  /** Imperative focus claim — used by ListItem on mousedown so a
   *  click both focuses the list and picks the row. */
  readonly focusList: () => void;
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
  /** Claim keyboard focus on mount. Use this on the primary selectable
   *  region of a view so arrows immediately navigate the list. */
  readonly autoFocus?: boolean;
  /** Stable focus id for callers that need to `focus()` the list
   *  imperatively. */
  readonly id?: string;
  /** Opt out of the Tab cycle while staying clickable + arrow-active
   *  via `value` / `onValueChange` from a parent. Default `true`. */
  readonly focusable?: boolean;
  readonly children?: ReactNode;
}

export function List({
  value,
  defaultValue,
  onValueChange,
  onSelect,
  autoFocus = false,
  id,
  focusable = true,
  children,
}: Readonly<ListProps>): React.ReactElement {
  const [internalValue, setInternalValue] = useState<string | null>(defaultValue ?? null);
  const [items, setItems] = useState<ReadonlyArray<ListItemEntry>>([]);

  const current = value ?? internalValue;

  const autoId = useId();
  const focusId = id ?? `list-${autoId}`;
  // List only joins the focus cycle when it actually has items —
  // claiming focus over an empty list confuses Tab navigation.
  const { isFocused } = useFocus({
    id: focusId,
    autoFocus,
    isActive: focusable && items.length > 0,
  });
  const { focus } = useFocusManager();
  const focusList = useCallback(() => focus(focusId), [focus, focusId]);

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
    setItems((prev) => (prev.some((it) => it.value === entry.value) ? prev : [...prev, entry]));
    const isOther = (it: ListItemEntry): boolean => it.value !== entry.value;
    return () => setItems((prev) => prev.filter(isOther));
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

  const navigable = isFocused && items.length > 0;
  useKey('upArrow', () => move(-1), navigable);
  useKey('downArrow', () => move(1), navigable);
  useKey('k', () => move(-1), navigable);
  useKey('j', () => move(1), navigable);
  useKey(
    'return',
    () => {
      const focused = items[focusIdx];
      if (focused) {
        select(focused.value);
      }
    },
    navigable && Boolean(onSelect)
  );

  const ctx = useMemo<ListContextValue>(
    () => ({
      value: current,
      setValue,
      registerItem,
      items,
      select,
      listFocused: isFocused,
      focusList,
    }),
    [current, setValue, registerItem, items, select, isFocused, focusList]
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
  const {
    registerItem,
    value: focused,
    setValue,
    select,
    listFocused,
    focusList,
  } = useListContext('ListItem');
  const isFocused = focused === value;

  useEffect(() => registerItem({ value }), [registerItem, value]);

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
        // Mousedown picks the row AND focuses the list so arrows
        // immediately navigate from this point.
        focusList();
        setValue(value);
      } else if (e.action === 'click') {
        select(value);
      }
    },
    [setValue, select, focusList, value]
  );
  useMouse(handleMouse);

  // Leading glyph: bright cyan when both the row is selected AND the
  // list itself has focus; muted when only the row is selected (the
  // list is dormant). Gives an at-a-glance signal of "where do arrows
  // currently land?".
  const glyph = isFocused ? '▸ ' : '  ';
  let glyphColor: string | undefined;
  if (isFocused && listFocused) {
    glyphColor = 'cyan';
  } else if (isFocused) {
    glyphColor = 'gray';
  }

  return (
    <Box ref={boxRef}>
      <Text color={glyphColor} bold={isFocused && listFocused}>
        {glyph}
      </Text>
      <Box>{children}</Box>
    </Box>
  );
}
