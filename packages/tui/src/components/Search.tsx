/**
 * `<Search>` — keyboard-driven search picker, modelled on shadcn's
 * `<Command>` family. Composable sub-components keep the prop
 * surface flat and let the consumer choose what to render:
 *
 *   <Search onSelect={loadDetails} onAction={install}>
 *     <SearchInput placeholder="search registry…" />
 *     <SearchResults>
 *       {hits.map((hit) => (
 *         <SearchItem key={hit.id} value={hit}>
 *           <Text bold>{hit.name}</Text>
 *           <Text dimColor>{`  ${hit.description}`}</Text>
 *         </SearchItem>
 *       ))}
 *     </SearchResults>
 *     <SearchEmpty>start typing to search</SearchEmpty>
 *   </Search>
 *
 * `<Search>` owns:
 *   - the query string (controlled via `value` / `onValueChange`,
 *     or uncontrolled with `defaultValue`)
 *   - focus tracking (↑ / ↓)
 *   - `Enter`         ⇒ `onSelect(focusedItem)` — "open details"
 *   - `Ctrl+Enter`    ⇒ `onAction(focusedItem)` — the side-effect
 *     (install, delete, etc.) — so a stray Enter never fires it
 *   - `Esc`           ⇒ clears the query
 *
 * The consumer owns the result data — fetch / debounce / cache /
 * filter however they like. `<SearchItem value={…}>` registers each
 * row with the context so Enter / Ctrl+Enter know which item is
 * focused without the consumer having to wire `keyOf` callbacks.
 */

import { Box, Text } from 'ink';
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
import { Input } from './Input';

interface SearchItemEntry {
  readonly key: string;
  readonly value: unknown;
}

interface SearchContextValue {
  readonly query: string;
  readonly setQuery: (q: string) => void;
  readonly focusKey: string | null;
  readonly setFocusKey: (k: string | null) => void;
  readonly registerItem: (entry: SearchItemEntry) => () => void;
  readonly items: ReadonlyArray<SearchItemEntry>;
  readonly select: (item: unknown) => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

function useSearchContext(component: string): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) {
    throw new Error(`<${component}> must be rendered inside a <Search>`);
  }
  return ctx;
}

export interface SearchProps<T> {
  /** Controlled query string. */
  readonly value?: string;
  /** Default query string when uncontrolled. */
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  /** Fires on `Enter` against the focused item. */
  readonly onSelect?: (item: T) => void;
  /** Fires on `Ctrl+Enter` against the focused item. */
  readonly onAction?: (item: T) => void;
  readonly children?: ReactNode;
}

export function Search<T>({
  value,
  defaultValue,
  onValueChange,
  onSelect,
  onAction,
  children,
}: Readonly<SearchProps<T>>): React.ReactElement {
  const [internalQuery, setInternalQuery] = useState(defaultValue ?? '');
  const [items, setItems] = useState<ReadonlyArray<SearchItemEntry>>([]);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  // Latches for the user callbacks so SearchInput / key handlers
  // always see the latest closure without re-creating the context.
  const onSelectRef = useRef<typeof onSelect>(onSelect);
  const onActionRef = useRef<typeof onAction>(onAction);
  onSelectRef.current = onSelect;
  onActionRef.current = onAction;

  const query = value ?? internalQuery;

  const setQuery = useCallback(
    (q: string) => {
      if (value === undefined) {
        setInternalQuery(q);
      }
      onValueChange?.(q);
    },
    [value, onValueChange]
  );

  const registerItem = useCallback((entry: SearchItemEntry): (() => void) => {
    setItems((prev) => {
      if (prev.some((it) => it.key === entry.key)) {
        return prev;
      }
      return [...prev, entry];
    });
    return () => {
      setItems((prev) => prev.filter((it) => it.key !== entry.key));
    };
  }, []);

  // Snap focus to the first item whenever the registered set changes
  // and the previous focusKey has vanished from the list.
  useEffect(() => {
    if (items.length === 0) {
      if (focusKey !== null) {
        setFocusKey(null);
      }
      return;
    }
    if (!items.some((it) => it.key === focusKey)) {
      const first = items[0];
      if (first) {
        setFocusKey(first.key);
      }
    }
  }, [items, focusKey]);

  const focusIdx = useMemo(() => {
    if (focusKey === null) {
      return -1;
    }
    return items.findIndex((it) => it.key === focusKey);
  }, [items, focusKey]);

  const move = useCallback(
    (delta: number) => {
      if (items.length === 0) {
        return;
      }
      const cur = focusIdx === -1 ? 0 : focusIdx;
      const next = items[(cur + delta + items.length) % items.length];
      if (next) {
        setFocusKey(next.key);
      }
    },
    [items, focusIdx]
  );

  useKey('upArrow', () => move(-1), items.length > 0);
  useKey('downArrow', () => move(1), items.length > 0);
  useKey(
    'ctrl+return',
    () => {
      const focused = items[focusIdx];
      if (focused) {
        onActionRef.current?.(focused.value as T);
      }
    },
    items.length > 0 && Boolean(onAction)
  );

  const select = useCallback(
    (item: unknown) => {
      onSelectRef.current?.(item as T);
    },
    []
  );

  const ctx = useMemo<SearchContextValue>(
    () => ({ query, setQuery, focusKey, setFocusKey, registerItem, items, select }),
    [query, setQuery, focusKey, registerItem, items, select]
  );

  return (
    <SearchContext.Provider value={ctx}>
      <Box flexDirection="column">{children}</Box>
    </SearchContext.Provider>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

export interface SearchInputProps {
  readonly placeholder?: string;
  /** Tint for the cursor + border. Default `cyan`. */
  readonly accentColor?: string;
  /** Frame the input. Default `true`. */
  readonly border?: boolean;
}

export function SearchInput({
  placeholder = 'Search…',
  accentColor,
  border,
}: Readonly<SearchInputProps>): React.ReactElement {
  const ctx = useSearchContext('SearchInput');
  return (
    <Input
      value={ctx.query}
      onChange={ctx.setQuery}
      onSubmit={() => {
        const focused = ctx.items.find((it) => it.key === ctx.focusKey);
        if (focused) {
          ctx.select(focused.value);
        }
      }}
      onCancel={() => ctx.setQuery('')}
      placeholder={placeholder}
      kind="search"
      border={border}
      accentColor={accentColor}
    />
  );
}

export interface SearchResultsProps {
  readonly children?: ReactNode;
}

export function SearchResults({
  children,
}: Readonly<SearchResultsProps>): React.ReactElement {
  useSearchContext('SearchResults');
  return (
    <Box marginTop={1} flexDirection="column">
      {children}
    </Box>
  );
}

export interface SearchItemProps<T = unknown> {
  /** Item the parent's `onSelect` / `onAction` will receive. */
  readonly value: T;
  /** Stable identity for focus tracking. Falls back to a stringified
   *  form of `value` when omitted — provide explicitly for object
   *  values whose `toString` isn't unique. */
  readonly itemKey?: string;
  readonly children?: ReactNode;
}

export function SearchItem<T>({
  value,
  itemKey,
  children,
}: Readonly<SearchItemProps<T>>): React.ReactElement {
  const ctx = useSearchContext('SearchItem');
  const key = itemKey ?? (typeof value === 'string' ? value : String(value));
  useEffect(() => ctx.registerItem({ key, value }), [ctx, key, value]);
  const focused = ctx.focusKey === key;
  return (
    <Box>
      <Text color={focused ? 'cyan' : undefined}>{focused ? '▸ ' : '  '}</Text>
      <Box>{children}</Box>
    </Box>
  );
}

export interface SearchEmptyProps {
  readonly children?: ReactNode;
}

/** Rendered when no items are registered AND the query is empty —
 *  the "nothing yet" branch. Compose your own "no matches for X"
 *  node when the query is non-empty; Search doesn't pick a default
 *  for that case so the consumer controls the wording. */
export function SearchEmpty({
  children,
}: Readonly<SearchEmptyProps>): React.ReactElement | null {
  const ctx = useSearchContext('SearchEmpty');
  if (ctx.items.length > 0 || ctx.query.trim().length > 0) {
    return null;
  }
  return (
    <Box marginTop={1}>
      <Text dimColor>{children}</Text>
    </Box>
  );
}
