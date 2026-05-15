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

import { Box, Text } from 'ink';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useKey } from '../keys/useKey';

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
    setTabs((prev) => {
      if (prev.some((t) => t.value === entry.value)) {
        return prev;
      }
      return [...prev, entry];
    });
    return () => {
      setTabs((prev) => prev.filter((t) => t.value !== entry.value));
    };
  }, []);

  const ctx = useMemo<TabsContextValue>(
    () => ({ value: current, setValue, register, tabs }),
    [current, setValue, register, tabs]
  );

  return (
    <TabsContext.Provider value={ctx}>
      <Box flexDirection="column">{children}</Box>
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

  useKey('tab', () => move(1), enabled);
  useKey('shift+tab', () => move(-1), enabled);
  useKey('rightArrow', () => move(1), enabled);
  useKey('leftArrow', () => move(-1), enabled);

  return (
    <Box flexDirection="column">
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
      <Box>
        <TriggerUnderlines />
      </Box>
    </Box>
  );
}

/**
 * Render one `─` segment per trigger. Active tab's segment is cyan
 * (full); inactives are dim. Width = label length + 2 horizontal pad
 * + 1 for the trailing space between triggers — kept in sync with
 * `<TabsTrigger>`'s padding so the underline ends right under the
 * label. We pull lengths from the registered trigger list rather
 * than measuring DOM since Ink doesn't expose layout.
 */
function TriggerUnderlines(): React.ReactElement {
  const ctx = useTabsContext('TabsList');
  return (
    <>
      {ctx.tabs.map((t) => {
        const w = labelWidth(t);
        const active = ctx.value === t.value;
        return (
          <Box key={`u-${t.value}`} marginRight={1}>
            <Text color={active ? 'cyan' : undefined} dimColor={!active}>
              {'─'.repeat(w)}
            </Text>
          </Box>
        );
      })}
    </>
  );
}

/** Mirror of the visible glyph count in `<TabsTrigger>` so underlines line up. */
function labelWidth(t: TabRegistration): number {
  // `[s] ` prefix only renders for inactive triggers, but the underline
  // is the same width for active/inactive to keep the row stable when
  // the user cycles tabs.
  const prefix = t.shortcut ? `[${t.shortcut}] ` : '';
  return prefix.length + (t.labelLength ?? t.value.length);
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

export function TabsTrigger({
  value,
  shortcut,
  children,
}: Readonly<TabsTriggerProps>): React.ReactElement {
  const ctx = useTabsContext('TabsTrigger');
  // Register on mount, unregister on unmount — keeps the parent's
  // ordered tab list in sync with the rendered tree.
  const labelLength = typeof children === 'string' ? children.length : value.length;
  useEffect(
    () => ctx.register({ value, shortcut, labelLength }),
    [ctx, value, shortcut, labelLength]
  );

  const active = ctx.value === value;
  return (
    <Box marginRight={1}>
      {shortcut ? (
        <Text dimColor={!active} color={active ? 'cyan' : undefined}>
          [{shortcut}]{' '}
        </Text>
      ) : null}
      <Text bold={active} color={active ? 'cyan' : undefined} dimColor={!active}>
        {children}
      </Text>
    </Box>
  );
}

export interface TabsContentProps {
  readonly value: string;
  readonly children?: ReactNode;
}

export function TabsContent({
  value,
  children,
}: Readonly<TabsContentProps>): React.ReactElement | null {
  const ctx = useTabsContext('TabsContent');
  if (ctx.value !== value) {
    return null;
  }
  return (
    <Box flexDirection="column" marginTop={1}>
      {children}
    </Box>
  );
}
