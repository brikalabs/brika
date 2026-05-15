/**
 * `<DebugProvider>` — engine-level overlay that captures every
 * `console.*` call, every uncaught error, and exposes a REPL for
 * injecting arbitrary JS into the running process.
 *
 *   <DebugProvider>
 *     <App />
 *   </DebugProvider>
 *
 * Press **Ctrl+D** anywhere to open / close the window. While open,
 * the underlying app stays mounted (its component state survives) but
 * is hidden so the debug surface owns the screen — same trick
 * `<AppShell>` uses for the too-small warning.
 *
 * The console hooks install once per process (via the `debugBuffer`
 * singleton) so StrictMode's double-mount and remounts during HMR
 * don't compound — every log lands in a single stream.
 *
 * Props:
 *   - `enabled`     — opt-in flag, default `true`. When `false`, the
 *                     provider is a no-op pass-through, useful for
 *                     production builds.
 *   - `capacity`    — ring-buffer size. Default 500 entries.
 *   - `toggleKey`   — key spec for the open/close hotkey. Default
 *                     `'ctrl+d'`. Pass `null` to disable the hotkey
 *                     (apps can drive the overlay via `useDebug()`).
 */

import { Box, useInput } from 'ink';
import type React from 'react';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { debugBuffer } from './buffer';
import { DebugOverlay } from './DebugOverlay';
import { evaluate } from './evaluate';
import { formatValue } from './format';
import type { DebugContextValue, DebugLevel } from './types';
import { DebugContext } from './useDebug';

export interface DebugProviderProps {
  /** Opt-in flag. When `false`, console patching + hotkey are skipped
   *  and children render unchanged. Default `true`. */
  readonly enabled?: boolean;
  /** Ring-buffer size for captured entries. Default 500. */
  readonly capacity?: number;
  /** Key spec for toggling the overlay. Default `'ctrl+d'`. Pass
   *  `null` to disable; the overlay can still be driven via
   *  `useDebug().open()`. */
  readonly toggleKey?: string | null;
  readonly children?: ReactNode;
}

const DEFAULT_TOGGLE: string = 'ctrl+d';

export function DebugProvider({
  enabled = true,
  capacity,
  toggleKey = DEFAULT_TOGGLE,
  children,
}: Readonly<DebugProviderProps>): React.ReactElement {
  if (!enabled) {
    return <>{children}</>;
  }
  return (
    <DebugProviderInner capacity={capacity} toggleKey={toggleKey}>
      {children}
    </DebugProviderInner>
  );
}

interface InnerProps {
  readonly capacity?: number;
  readonly toggleKey: string | null;
  readonly children?: ReactNode;
}

function DebugProviderInner({
  capacity,
  toggleKey,
  children,
}: Readonly<InnerProps>): React.ReactElement {
  // Install console / error hooks on mount. Singleton-guarded so
  // remounts (HMR, StrictMode) don't double-wrap.
  useEffect(() => {
    if (capacity !== undefined) {
      debugBuffer.setCapacity(capacity);
    }
    debugBuffer.install();
  }, [capacity]);

  // Subscribe to the buffer with `useSyncExternalStore` — the snapshot
  // is the entries array, which the buffer mutates by replacement
  // (slice on trim, push on add) so referential equality flips on
  // every change. That gives us tear-free updates across StrictMode.
  const entries = useSyncExternalStore(
    debugBuffer.subscribe.bind(debugBuffer),
    debugBuffer.getEntries.bind(debugBuffer),
    debugBuffer.getEntries.bind(debugBuffer)
  );

  const [isOpen, setOpen] = useState<boolean>(false);

  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const clear = useCallback(() => debugBuffer.clear(), []);
  const push = useCallback((level: DebugLevel, text: string, source?: string) => {
    debugBuffer.push(level, text, source);
  }, []);

  const evaluateCode = useCallback(async (code: string): Promise<unknown> => {
    debugBuffer.push('repl', `❯ ${code}`, 'repl');
    const result = await evaluate(code);
    debugBuffer.push(result.ok ? 'log' : 'error', formatValue(result.value), 'repl');
    return result.value;
  }, []);

  // Global toggle hotkey. We use `useInput` directly (not `useKey`)
  // so the bind keeps firing even when an input field is focused —
  // a debug overlay you can't open from inside a text field is mostly
  // useless. Ctrl+D doesn't collide with typing.
  useInput(
    (input, key) => {
      if (!toggleKey) {
        return;
      }
      if (matchesSimple(toggleKey, input, key)) {
        toggle();
      }
    },
    { isActive: Boolean(toggleKey) }
  );

  const value = useMemo<DebugContextValue>(
    () => ({
      entries,
      isOpen,
      open,
      close,
      toggle,
      clear,
      push,
      evaluate: evaluateCode,
    }),
    [entries, isOpen, open, close, toggle, clear, push, evaluateCode]
  );

  return (
    <DebugContext.Provider value={value}>
      {/* Children stay mounted while the overlay is up so their state
       *  survives (form drafts, scroll positions, ongoing fetches).
       *  Hiding via display="none" mirrors the AppShell too-small
       *  pattern. */}
      <Box display={isOpen ? 'none' : 'flex'} flexDirection="column">
        {children}
      </Box>
      {isOpen ? <DebugOverlay /> : null}
    </DebugContext.Provider>
  );
}

/** Minimal ink-key matcher for the toggle binding. Supports
 *  `ctrl+<char>` and bare chars / `escape`. We don't pull in the full
 *  `useKey` parser because that one auto-suspends under input capture,
 *  which is exactly what we DON'T want here. */
function matchesSimple(
  spec: string,
  input: string,
  key: { readonly ctrl: boolean; readonly meta: boolean; readonly escape: boolean }
): boolean {
  const parts = spec.split('+');
  const last = parts.at(-1);
  if (!last) {
    return false;
  }
  const mods = new Set(parts.slice(0, -1));
  if (mods.has('ctrl') !== key.ctrl) {
    return false;
  }
  if (mods.has('meta') !== key.meta) {
    return false;
  }
  if (last === 'escape') {
    return key.escape;
  }
  return input === last;
}
