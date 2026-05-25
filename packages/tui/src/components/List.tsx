/**
 * `<List>` + `<ListItem>` — arrow-navigable, mouse-clickable
 * selection list.
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
 * Accessibility model
 *   - `<List>` is a single focus slot (not one slot per item) and
 *     joins the Tab cycle so keyboard-only users can reach it.
 *   - **Arrow keys / Enter are scoped to focus.** `↑` / `↓` / `j` / `k`
 *     / `Enter` only fire when the list actually owns focus, so the
 *     same keys can mean other things elsewhere on the screen (the log
 *     pane's scroller, a sibling form's vim motions). Combine with
 *     `autoFocus` to make the list usable the moment a view mounts
 *     without a Tab dance. Bindings auto-suspend during input capture
 *     (`<Input>` / `<Confirm>` / `<Form>`) so typing in a sibling
 *     search field never leaks into list navigation.
 *   - Click a row to select it; the list claims focus as a side effect
 *     so subsequent keystrokes land here.
 *
 * Bindings:
 *   - `↑` / `↓` / `k` / `j` — move the cursor.
 *   - `Enter`                — fires `onSelect(value)` for the focused row.
 *   - **Mouse click** on a row focuses the list + selects it.
 */

import { Box, type DOMElement, Text, useFocusManager } from 'ink';
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
import { useFocusable } from '../keys/useFocusable';
import { useShortcut } from '../keys/useShortcut';
import { useClickable } from '../mouse/useClickable';

interface ListItemEntry {
  readonly value: string;
}

interface ListContextValue {
  readonly value: string | null;
  readonly setValue: (v: string) => void;
  readonly registerItem: (entry: ListItemEntry) => () => void;
  readonly items: ReadonlyArray<ListItemEntry>;
  readonly select: (v: string) => void;
  /** True when the parent `<List>` currently owns focus. */
  readonly listFocused: boolean;
  /** Imperative focus claim — used by ListItem on click so a click
   *  both selects the row and parks Tab traversal here. */
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
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly onSelect?: (value: string) => void;
  /** Fires when the list's keyboard-focus state changes. Use this to
   *  drive external chrome (e.g. a wrapping pane's border accent) since
   *  the List owns its focus slot internally — there's no other way to
   *  observe `isFocused` from outside the subtree. */
  readonly onFocusChange?: (focused: boolean) => void;
  readonly autoFocus?: boolean;
  readonly id?: string;
  /** Opt out of the Tab cycle while staying clickable. Default `true`. */
  readonly focusable?: boolean;
  readonly children?: ReactNode;
}

export function List({
  value,
  defaultValue,
  onValueChange,
  onSelect,
  onFocusChange,
  autoFocus = false,
  id,
  focusable = true,
  children,
}: Readonly<ListProps>): React.ReactElement {
  const [internalValue, setInternalValue] = useState<string | null>(defaultValue ?? null);
  const [items, setItems] = useState<ReadonlyArray<ListItemEntry>>([]);

  const current = value ?? internalValue;

  const ref = useRef<DOMElement>(null);
  const { isFocused, focusId } = useFocusable({
    id,
    autoFocus,
    enabled: focusable,
    suppressActivation: true,
    ref,
  });
  const { focus } = useFocusManager();
  const focusList = useCallback(() => focus(focusId), [focus, focusId]);

  const onFocusChangeRef = useRef(onFocusChange);
  onFocusChangeRef.current = onFocusChange;
  useEffect(() => {
    onFocusChangeRef.current?.(isFocused);
  }, [isFocused]);

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

  // Mirror focusIdx into a ref + advance it imperatively whenever we
  // move so back-to-back keystrokes don't both step from the same
  // pre-render index. Without this, two arrows fired before React
  // commits the first re-render would both see the original cursor.
  const focusIdxRef = useRef(focusIdx);
  focusIdxRef.current = focusIdx;

  const move = useCallback(
    (delta: number) => {
      if (items.length === 0) {
        return;
      }
      const cur = focusIdxRef.current === -1 ? 0 : focusIdxRef.current;
      const nextIdx = (cur + delta + items.length) % items.length;
      const next = items[nextIdx];
      if (next) {
        focusIdxRef.current = nextIdx;
        setValue(next.value);
        // Side-effect: bring focus here so the user's next Tab starts
        // from this list rather than wherever it was previously parked.
        focusList();
      }
    },
    [items, setValue, focusList]
  );

  const select = useCallback((v: string) => {
    onSelectRef.current?.(v);
  }, []);

  // Arrows / vim keys / Enter are focus-gated so the same keys can
  // legitimately mean something else elsewhere on the screen — e.g.
  // mortar's log pane uses `↑` / `↓` for line-scroll while the
  // service list is on the same view. Combine with `autoFocus` to
  // make the list keyboard-driven from the moment a view mounts.
  // `useShortcut` also auto-suspends during input capture (Input /
  // Form / Confirm), so typing in a sibling search field never leaks
  // into list navigation.
  const enabled = focusable && items.length > 0 && isFocused;
  useShortcut('upArrow', () => move(-1), enabled);
  useShortcut('downArrow', () => move(1), enabled);
  useShortcut('k', () => move(-1), enabled);
  useShortcut('j', () => move(1), enabled);
  useShortcut(
    'return',
    () => {
      const focused = items[focusIdx];
      if (focused) {
        select(focused.value);
      }
    },
    enabled && Boolean(onSelect)
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
      <Box ref={ref} flexDirection="column">
        {children}
      </Box>
    </ListContext.Provider>
  );
}

export interface ListItemProps {
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

  // Mouse: click focuses the list, picks the row, fires onSelect.
  const boxRef = useRef<DOMElement>(null);
  const onClick = useCallback(() => {
    focusList();
    setValue(value);
    select(value);
  }, [focusList, setValue, select, value]);
  useClickable(boxRef, onClick);

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
