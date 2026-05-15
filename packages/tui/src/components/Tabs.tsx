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
 * API mirrors shadcn (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`)
 * including controlled vs uncontrolled selection. Differences from the
 * web component, all forced by the terminal:
 *
 *   - **Keyboard navigation**: `Tab` cycles forward, `Shift+Tab`
 *     cycles back. `←` / `→` also work — same as shadcn's roving
 *     focus. Optional `shortcut="x"` on a trigger jumps directly.
 *   - **Visual style**: active trigger is bold cyan with a `▸ ` caret;
 *     inactive triggers are dim. A thin underline (`▔`) marks the
 *     active tab's column so the eye can find it without colour.
 *   - **Layout**: `TabsList` renders horizontally, content panel grows
 *     vertically. Both `Tabs` and `TabsContent` use `flexDirection`
 *     `column` so consumer trees stretch correctly inside flex layouts.
 *
 * Like shadcn, you can omit a `TabsList` if you want to drive the
 * selection externally (controlled mode) — `TabsContent` only depends
 * on the context's current value, not on `TabsList`'s presence.
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
import { useKey } from '../keys/useKey';
import { useClickable } from '../mouse/useClickable';

interface TabRegistration {
  readonly value: string;
  readonly shortcut?: string;
  /** Visible width of the trigger label — used by `TriggerUnderlines`
   *  to draw the indicator at exactly the right length. Defaults to
   *  `value.length` when the label isn't a plain string child. */
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
  /** Controlled value. Pair with `onValueChange`. */
  readonly value?: string;
  /** Default value when uncontrolled. Falls back to the first registered tab. */
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly children?: ReactNode;
}

export function Tabs({
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

  // If nothing is selected yet (no defaultValue, no controlled value),
  // snap to the first trigger as soon as it registers.
  useEffect(() => {
    if (value === undefined && internal === '' && tabs.length > 0) {
      const first = tabs[0];
      if (first) {
        setInternal(first.value);
      }
    }
  }, [value, internal, tabs]);

  const register = useCallback((entry: TabRegistration): (() => void) => {
    setTabs((prev) => (prev.some((t) => t.value === entry.value) ? prev : [...prev, entry]));
    const isOther = (t: TabRegistration): boolean => t.value !== entry.value;
    return () => setTabs((prev) => prev.filter(isOther));
  }, []);

  const ctx = useMemo<TabsContextValue>(
    () => ({ value: current, setValue, register, tabs }),
    [current, setValue, register, tabs]
  );

  return (
    <TabsContext.Provider value={ctx}>
      <Box flexDirection="column" flexGrow={1}>
        {children}
      </Box>
    </TabsContext.Provider>
  );
}

function useTabsContext(component: string): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error(`<${component}> must be rendered inside a <Tabs> tree`);
  }
  return ctx;
}

export interface TabsListProps {
  /** Disable keyboard navigation. Useful when a child overlay (form,
   *  filter input, modal) is consuming keys and you don't want the
   *  tab triggers to compete. */
  readonly disabled?: boolean;
  readonly children?: ReactNode;
}

export function TabsList({
  disabled = false,
  children,
}: Readonly<TabsListProps>): React.ReactElement {
  const ctx = useTabsContext('TabsList');
  const enabled = !disabled && ctx.tabs.length > 0;

  const move = useCallback(
    (delta: number) => {
      const idx = ctx.tabs.findIndex((t) => t.value === ctx.value);
      const next = ((idx === -1 ? 0 : idx) + delta + ctx.tabs.length) % ctx.tabs.length;
      const target = ctx.tabs[next];
      if (target) {
        ctx.setValue(target.value);
      }
    },
    [ctx]
  );

  // Arrow keys switch tabs. Plain `Tab` / `Shift+Tab` are reserved
  // for ink's focus cycle between focusable elements (Inputs,
  // Buttons) — wrestling Tab away from focus management would
  // mean the user couldn't escape a sub-panel input via Tab.
  useKey('rightArrow', () => move(1), enabled);
  useKey('leftArrow', () => move(-1), enabled);

  return (
    <Box>
      {children}
      {ctx.tabs.map((t) =>
        t.shortcut ? (
          <ShortcutBind
            key={`sc-${t.value}`}
            shortcut={t.shortcut}
            value={t.value}
            enabled={enabled}
          />
        ) : null
      )}
    </Box>
  );
}

function ShortcutBind({
  shortcut,
  value,
  enabled,
}: Readonly<{ shortcut: string; value: string; enabled: boolean }>): React.ReactElement | null {
  const ctx = useTabsContext('TabsList');
  useKey(shortcut, () => ctx.setValue(value), enabled);
  return null;
}

export interface TabsTriggerProps {
  readonly value: string;
  /** Optional single-character hotkey for direct access. */
  readonly shortcut?: string;
  readonly children?: ReactNode;
}

/**
 * Each trigger renders its own column — `[shortcut] label` on top,
 * an underline directly under it — so the indicator can never go
 * out of sync with the label (no two-row registration race the old
 * design had). Inactive triggers keep the same column width so the
 * row geometry stays stable when the user cycles tabs.
 *
 * Inactive triggers stay at the terminal's default foreground colour
 * (no `dimColor`) — some terminals render dim as nearly invisible,
 * which made the old tabs look like they'd vanished. The contrast
 * cue comes entirely from bold + the cyan/grey underline pair.
 */
export function TabsTrigger({
  value,
  shortcut,
  children,
}: Readonly<TabsTriggerProps>): React.ReactElement {
  const ctx = useTabsContext('TabsTrigger');
  const { register, setValue } = ctx;
  const labelLength = typeof children === 'string' ? children.length : value.length;
  const ref = useRef<DOMElement>(null);

  // Registration is still nice-to-have for shortcut binds + count,
  // but the visual is no longer driven by it.
  //
  // Important: depend on the STABLE `register` callback, not the
  // whole `ctx` object. `ctx` is re-created every time `tabs`
  // changes (which is what register triggers) — putting `ctx` in
  // the deps causes an effect/cleanup oscillation, which React
  // surfaces as "Maximum update depth exceeded".
  useEffect(
    () => register({ value, shortcut, labelLength }),
    [register, value, shortcut, labelLength]
  );

  // Mouse: click anywhere on the trigger to activate it. Same hit-
  // test pattern as `<MenuBar>` / `<Button>` so the affordance feels
  // consistent across the app.
  const select = useCallback(() => setValue(value), [setValue, value]);
  useClickable(ref, select);

  const active = ctx.value === value;
  const prefix = shortcut ? `[${shortcut}] ` : '';
  const fullWidth = prefix.length + labelLength;

  return (
    <Box ref={ref} flexDirection="column" marginRight={3} flexShrink={0}>
      <Box>
        {shortcut ? <Text color={active ? 'cyan' : undefined}>{prefix}</Text> : null}
        <Text bold={active} color={active ? 'cyan' : undefined}>
          {children}
        </Text>
      </Box>
      <Box>
        <Text color={active ? 'cyan' : 'gray'} bold={active}>
          {(active ? '━' : '─').repeat(Math.max(1, fullWidth))}
        </Text>
      </Box>
    </Box>
  );
}

export interface TabsContentProps {
  readonly value: string;
  /** Keep the inactive panel mounted (with `display: 'none'`) instead
   *  of unmounting it. Default `true` — preserves form drafts, scroll
   *  positions, ongoing fetches across tab switches. Set `false` for
   *  panels that own expensive subscriptions you'd rather tear down
   *  while the tab is hidden. */
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
  return (
    <Box
      display={active ? 'flex' : 'none'}
      flexDirection="column"
      flexGrow={active ? 1 : 0}
      marginTop={active ? 1 : 0}
    >
      {children}
    </Box>
  );
}
