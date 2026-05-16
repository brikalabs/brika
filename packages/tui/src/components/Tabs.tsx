/**
 * `<Tabs>` — terminal port of shadcn's Tabs primitive.
 *
 *   <Tabs defaultValue="installed">
 *     <TabsList>
 *       <TabsTrigger value="installed">Installed</TabsTrigger>
 *       <TabsTrigger value="search" shortcut="s">Search</TabsTrigger>
 *     </TabsList>
 *     <TabsContent value="installed"><Installed /></TabsContent>
 *     <TabsContent value="search"><Search /></TabsContent>
 *   </Tabs>
 *
 * Keyboard navigation:
 *   - `Tab` cycles forward, `Shift+Tab` cycles back (ink focus cycle).
 *   - `←` / `→` are scope-bound — fire only while a `TabsTrigger` has
 *     focus, so they don't compete with sibling lists / panes.
 *   - Optional `shortcut="x"` on a trigger jumps directly from anywhere
 *     in the surrounding focus scope.
 *
 * Router mode (`<Tabs router defaultValue="installed">`): binds the
 * active tab to the surrounding `<Outlet />` depth's path segment.
 * Switching tabs calls `router.navigatePath`; navigating from elsewhere
 * (deep link, programmatic) switches the visible tab. Use `<Outlet />`
 * inside the layout instead of `<TabsContent>` to render the child
 * route's component.
 */

import { Box, type DOMElement, Text } from 'ink';
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
import { FocusActive } from '../keys/FocusActive';
import { useFocusable } from '../keys/useFocusable';
import { useShortcut } from '../keys/useShortcut';
import { useOutletDepth } from '../router/Outlet';
import type { RoutePath, RouteSegment } from '../router/types';
import { useRouter } from '../router/useRouter';

interface TabRegistration {
  readonly value: string;
  readonly labelLength?: number;
}

interface TabsContextValue {
  readonly value: string;
  readonly setValue: (v: string) => void;
  readonly register: (entry: TabRegistration) => () => void;
  readonly tabs: ReadonlyArray<TabRegistration>;
}

const TabsContext = createContext<TabsContextValue | null>(null);

export interface TabsProps {
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  /**
   * Bind the active tab to the surrounding router's path segment at
   * this `<Outlet />` depth. When enabled, switching tabs calls
   * `router.navigatePath` (so back/forward Just Works) and the visible
   * tab follows external navigation (deep links, `router.navigatePath`
   * from other code). `value` / `onValueChange` are ignored in this
   * mode — the router is the source of truth. Pair with `<Outlet />`
   * inside the layout to render the active child route.
   */
  readonly router?: boolean;
  readonly children?: ReactNode;
}

export function Tabs(props: Readonly<TabsProps>): React.ReactElement {
  return props.router ? <RouterTabs {...props} /> : <LocalTabs {...props} />;
}

function LocalTabs({
  value,
  defaultValue,
  onValueChange,
  children,
}: Readonly<TabsProps>): React.ReactElement {
  const [internal, setInternal] = useState<string>(defaultValue ?? '');
  const [tabs, setTabs] = useState<ReadonlyArray<TabRegistration>>([]);

  const current = value ?? internal;

  const setValue = useCallback(
    (v: string) => {
      if (value === undefined) {
        setInternal(v);
      }
      onValueChange?.(v);
    },
    [value, onValueChange]
  );

  useEffect(() => {
    if (value === undefined && internal === '' && tabs.length > 0) {
      const first = tabs[0];
      if (first) {
        setInternal(first.value);
      }
    }
  }, [value, internal, tabs]);

  const register = useRegisterTabs(setTabs);

  const ctx = useMemo<TabsContextValue>(
    () => ({ value: current, setValue, register, tabs }),
    [current, setValue, register, tabs]
  );

  return <TabsShell ctx={ctx}>{children}</TabsShell>;
}

function RouterTabs({ defaultValue, children }: Readonly<TabsProps>): React.ReactElement {
  const router = useRouter();
  const depth = useOutletDepth();
  const [tabs, setTabs] = useState<ReadonlyArray<TabRegistration>>([]);

  const segment = router.path[depth];
  const current = segment?.name ?? defaultValue ?? '';

  // Seed the router with `defaultValue` once a tab is registered, so a
  // deep-link to the parent route lands on the right child without the
  // user (or layout) having to call navigatePath themselves.
  useEffect(() => {
    if (segment || tabs.length === 0) {
      return;
    }
    const target =
      defaultValue && tabs.some((t) => t.value === defaultValue) ? defaultValue : tabs[0]?.value;
    if (target) {
      // `replace: true` so `back()` returns to before the parent route
      // rather than bouncing off the auto-redirect into an infinite
      // loop (pop → re-render → re-default → push → pop …).
      router.navigatePath(buildPath(router.path, depth, target), { replace: true });
    }
  }, [router, depth, segment, defaultValue, tabs]);

  const setValue = useCallback(
    (v: string) => {
      if (v === segment?.name) {
        return;
      }
      router.navigatePath(buildPath(router.path, depth, v));
    },
    [router, depth, segment]
  );

  const register = useRegisterTabs(setTabs);

  const ctx = useMemo<TabsContextValue>(
    () => ({ value: current, setValue, register, tabs }),
    [current, setValue, register, tabs]
  );

  return <TabsShell ctx={ctx}>{children}</TabsShell>;
}

function useRegisterTabs(
  setTabs: React.Dispatch<React.SetStateAction<ReadonlyArray<TabRegistration>>>
): (entry: TabRegistration) => () => void {
  return useCallback(
    (entry: TabRegistration): (() => void) => {
      setTabs((prev) => (prev.some((t) => t.value === entry.value) ? prev : [...prev, entry]));
      const isOther = (t: TabRegistration): boolean => t.value !== entry.value;
      return () => setTabs((prev) => prev.filter(isOther));
    },
    [setTabs]
  );
}

function TabsShell({
  ctx,
  children,
}: Readonly<{ ctx: TabsContextValue; children?: ReactNode }>): React.ReactElement {
  return (
    <TabsContext.Provider value={ctx}>
      <Box flexDirection="column" flexGrow={1}>
        {children}
      </Box>
    </TabsContext.Provider>
  );
}

function buildPath(path: RoutePath, depth: number, name: string): RoutePath {
  const head = path.slice(0, depth) as ReadonlyArray<RouteSegment>;
  const next: RouteSegment = { name };
  // Truncate everything past the segment we're replacing — switching a
  // tab on the parent shouldn't keep stale grandchildren around.
  return [...head, next] as unknown as RoutePath;
}

function useTabsContext(component: string): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error(`<${component}> must be rendered inside a <Tabs> tree`);
  }
  return ctx;
}

export interface TabsApi {
  /** Currently active tab value. */
  readonly value: string;
  /** Activate a tab by its `value`. */
  readonly setValue: (value: string) => void;
  /** Snapshot of every registered trigger. */
  readonly tabs: ReadonlyArray<{ readonly value: string }>;
}

/**
 * Read / drive the surrounding `<Tabs>` state from any descendant.
 * Used by panels that need to switch tabs from within their own UI
 * (e.g. an "→ search" action on the Installed tab that jumps to the
 * Search tab without making the user reach for the keyboard).
 */
export function useTabs(): TabsApi {
  const ctx = useTabsContext('useTabs');
  return { value: ctx.value, setValue: ctx.setValue, tabs: ctx.tabs };
}

export interface TabsListProps {
  readonly children?: ReactNode;
}

export function TabsList({ children }: Readonly<TabsListProps>): React.ReactElement {
  useTabsContext('TabsList');
  // The triggers themselves carry the ← / → bindings (gated by their
  // own focus state) so the list doesn't need a dedicated scope here.
  return <Box>{children}</Box>;
}

export interface TabsTriggerProps {
  readonly value: string;
  /** Optional single-character hotkey for direct access. */
  readonly shortcut?: string;
  readonly children?: ReactNode;
}

export function TabsTrigger({
  value,
  shortcut,
  children,
}: Readonly<TabsTriggerProps>): React.ReactElement {
  const ctx = useTabsContext('TabsTrigger');
  const { register, setValue, value: current, tabs } = ctx;
  const labelLength = typeof children === 'string' ? children.length : value.length;
  const ref = useRef<DOMElement>(null);

  useEffect(() => register({ value, labelLength }), [register, value, labelLength]);

  const select = useCallback(() => setValue(value), [setValue, value]);
  const { isFocused } = useFocusable({ id: `tab-${value}`, onPress: select, ref });

  // Optional direct-jump shortcut (e.g. `s` to jump to the Search tab).
  // Registered with the surrounding scope so it fires even when the
  // trigger itself isn't focused — same UX as a `<Button>` shortcut.
  useShortcut(shortcut ?? '', select, Boolean(shortcut));

  // ← / → cycle between triggers while THIS one is focused. Anchored to
  // the focused trigger so multiple TabsLists on the same screen don't
  // fight for the arrow keys.
  const move = useCallback(
    (delta: number) => {
      const idx = tabs.findIndex((t) => t.value === value);
      const next = ((idx === -1 ? 0 : idx) + delta + tabs.length) % tabs.length;
      const target = tabs[next];
      if (target) {
        setValue(target.value);
      }
    },
    [tabs, value, setValue]
  );
  useShortcut('rightArrow', () => move(1), isFocused && tabs.length > 1);
  useShortcut('leftArrow', () => move(-1), isFocused && tabs.length > 1);

  const active = current === value;
  const prefix = shortcut ? `[${shortcut}] ` : '';
  const fullWidth = prefix.length + labelLength;
  const accent = active || isFocused ? 'cyan' : undefined;

  return (
    <Box ref={ref} flexDirection="column" marginRight={3} flexShrink={0}>
      <Box>
        {shortcut ? <Text color={accent}>{prefix}</Text> : null}
        <Text bold={active || isFocused} color={accent}>
          {children}
        </Text>
      </Box>
      <Box>
        <Text color={accent ?? 'gray'} bold={active}>
          {(active || isFocused ? '━' : '─').repeat(Math.max(1, fullWidth))}
        </Text>
      </Box>
    </Box>
  );
}

export interface TabsContentProps {
  readonly value: string;
  readonly keepMounted?: boolean;
  readonly children?: ReactNode;
}

export function TabsContent({
  value,
  keepMounted = true,
  children,
}: Readonly<TabsContentProps>): React.ReactElement | null {
  const ctx = useTabsContext('TabsContent');
  const active = ctx.value === value;
  if (!active && !keepMounted) {
    return null;
  }
  // Wrap in FocusActive so focusables inside the inactive panel drop
  // out of ink's Tab cycle. Without this, a hidden tab's `<Input>`
  // (with default autoFocus) would claim focus before the visible
  // tab's primary focusable on mount.
  return (
    <FocusActive active={active}>
      <Box
        display={active ? 'flex' : 'none'}
        flexDirection="column"
        flexGrow={active ? 1 : 0}
        marginTop={active ? 1 : 0}
      >
        {children}
      </Box>
    </FocusActive>
  );
}
