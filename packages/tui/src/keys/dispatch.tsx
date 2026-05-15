/**
 * Hierarchical key dispatch — scopes, focus path, bubbling, cancellation.
 *
 *   <KeyDispatchProvider>
 *     <FocusScope autoFocus>
 *       <Button shortcut="e" onPress={…} />
 *       <FocusScope>                              ← nested scope
 *         <Button shortcut="e" onPress={…} />     ← fires first, can
 *       </FocusScope>                               cancel the outer
 *     </FocusScope>
 *   </KeyDispatchProvider>
 *
 * Model:
 *   - One `useInput` lives in `<KeyDispatchProvider>`. Every keystroke
 *     funnels through it; nothing else listens.
 *   - A `<FocusScope>` is a single node in the focus tree — owns one
 *     ink `useFocus` slot, registers a parent link with the dispatcher.
 *   - The "focus path" is the chain from root → focused leaf scope.
 *     Only handlers in scopes ON THIS PATH fire on a given keystroke;
 *     scopes off-path (a hidden tab, another view) stay silent.
 *   - Dispatch order is deepest-first; a handler can call
 *     `event.stopPropagation()` to consume the event and prevent
 *     ancestor scopes from seeing it.
 *
 * `useShortcut(spec, handler)` registers a handler with the nearest
 * `<FocusScope>`. Outside any scope it is a no-op (fail-closed) — every
 * action must declare the activation context it lives in.
 */

import { type Key, useFocus, useInput } from 'ink';
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
} from 'react';
import { matches, parseSpec, useKey } from './useKey';

export interface KeyEvent {
  readonly input: string;
  readonly key: Key;
  /** Stop the event from propagating to ancestor scopes. Handlers in
   *  the same scope still run; ancestor scopes are skipped entirely. */
  stopPropagation(): void;
  /** Whether `stopPropagation()` has been called on this event. */
  readonly isPropagationStopped: boolean;
}

interface HandlerEntry {
  readonly spec: string;
  readonly handler: (e: KeyEvent) => void;
}

interface ScopeNode {
  readonly id: string;
  parentId: string | null;
  isFocused: boolean;
  readonly handlers: HandlerEntry[];
}

interface DispatchAPI {
  registerScope(id: string, parentId: string | null): void;
  unregisterScope(id: string): void;
  setScopeFocus(id: string, focused: boolean): void;
  registerHandler(scopeId: string, entry: HandlerEntry): () => void;
}

const DispatchContext = createContext<DispatchAPI | null>(null);
const ScopeContext = createContext<string | null>(null);

export interface KeyDispatchProviderProps {
  readonly children?: ReactNode;
}

export function KeyDispatchProvider({
  children,
}: Readonly<KeyDispatchProviderProps>): React.ReactElement {
  const scopesRef = useRef<Map<string, ScopeNode>>(new Map());

  const registerScope = useCallback((id: string, parentId: string | null): void => {
    const existing = scopesRef.current.get(id);
    if (existing) {
      existing.parentId = parentId;
      return;
    }
    scopesRef.current.set(id, { id, parentId, isFocused: false, handlers: [] });
  }, []);

  const unregisterScope = useCallback((id: string): void => {
    scopesRef.current.delete(id);
  }, []);

  const setScopeFocus = useCallback((id: string, focused: boolean): void => {
    const node = scopesRef.current.get(id);
    if (node) {
      node.isFocused = focused;
    }
  }, []);

  const registerHandler = useCallback(
    (scopeId: string, entry: HandlerEntry): (() => void) => {
      const node = scopesRef.current.get(scopeId);
      if (!node) {
        return () => {};
      }
      node.handlers.push(entry);
      return () => {
        const idx = node.handlers.indexOf(entry);
        if (idx >= 0) {
          node.handlers.splice(idx, 1);
        }
      };
    },
    []
  );

  useInput((input, key) => {
    // Find the focused leaf scope. Only one scope's `isFocused` should
    // be true at a time (ink only marks one element focused).
    let leaf: ScopeNode | null = null;
    for (const node of scopesRef.current.values()) {
      if (node.isFocused) {
        leaf = node;
        break;
      }
    }
    if (!leaf) {
      return;
    }

    // Walk leaf → root, collecting ancestors on the focus path.
    const path: ScopeNode[] = [];
    let cur: ScopeNode | undefined = leaf;
    while (cur) {
      path.push(cur);
      if (!cur.parentId) {
        break;
      }
      cur = scopesRef.current.get(cur.parentId);
    }

    let stopped = false;
    const event: KeyEvent = {
      input,
      key,
      stopPropagation: () => {
        stopped = true;
      },
      get isPropagationStopped() {
        return stopped;
      },
    };

    outer: for (const scope of path) {
      // Snapshot — a handler may unregister mid-dispatch (e.g. when its
      // owning component unmounts in response to an earlier handler).
      const snapshot = scope.handlers.slice();
      for (const entry of snapshot) {
        if (matches(parseSpec(entry.spec), input, key)) {
          entry.handler(event);
          if (stopped) {
            break outer;
          }
        }
      }
    }
  });

  const api = useMemo<DispatchAPI>(
    () => ({ registerScope, unregisterScope, setScopeFocus, registerHandler }),
    [registerScope, unregisterScope, setScopeFocus, registerHandler]
  );

  return <DispatchContext.Provider value={api}>{children}</DispatchContext.Provider>;
}

function useDispatch(): DispatchAPI | null {
  return useContext(DispatchContext);
}

/** Id of the nearest `<FocusScope>` ancestor, or `null` outside any. */
export function useScopeId(): string | null {
  return useContext(ScopeContext);
}

export interface FocusScopeProps {
  readonly id?: string;
  /** Claim ink's focus slot on mount when no other element owns it. */
  readonly autoFocus?: boolean;
  /** Join the Tab cycle. Default `true`. Set `false` for purely-logical
   *  scopes (e.g. a root scope that only hosts global shortcuts and
   *  shouldn't be reachable by Tab). Off-cycle scopes still fire their
   *  handlers as ancestors on a descendant's focus path. */
  readonly focusable?: boolean;
  readonly children?: ReactNode;
}

/**
 * A node in the focus tree. Owns one ink `useFocus` slot, registers
 * itself with the dispatcher's tree, and provides scope context to
 * descendants so `useShortcut` / nested `<FocusScope>` know their parent.
 *
 *   <FocusScope autoFocus>
 *     <Button shortcut="e" …/>     ← registers with THIS scope
 *   </FocusScope>
 */
export function FocusScope({
  id,
  autoFocus = false,
  focusable = true,
  children,
}: Readonly<FocusScopeProps>): React.ReactElement {
  const autoId = useId();
  const scopeId = id ?? `focus-scope-${autoId}`;
  const parentId = useContext(ScopeContext);
  const dispatch = useDispatch();

  useEffect(() => {
    if (!dispatch) {
      return;
    }
    dispatch.registerScope(scopeId, parentId);
    return () => dispatch.unregisterScope(scopeId);
  }, [dispatch, scopeId, parentId]);

  const { isFocused } = useFocus({ id: scopeId, autoFocus, isActive: focusable });

  useEffect(() => {
    if (!dispatch) {
      return;
    }
    dispatch.setScopeFocus(scopeId, isFocused);
    return () => dispatch.setScopeFocus(scopeId, false);
  }, [dispatch, scopeId, isFocused]);

  return <ScopeContext.Provider value={scopeId}>{children}</ScopeContext.Provider>;
}

/**
 * Register a shortcut.
 *
 *   useShortcut('e', () => enable());
 *   useShortcut('escape', (e) => { e.stopPropagation(); close(); });
 *
 * - **Inside a `<FocusScope>`**: registered with the nearest scope —
 *   fires only when that scope is on the current focus path, with
 *   deepest-first ordering and `event.stopPropagation()` support.
 * - **Outside any scope**: falls back to a plain `useKey` (subject to
 *   the legacy capture-suspend rules in `useKey`). Use for genuinely
 *   global shortcuts whose owning context is "the whole app."
 */
export function useShortcut(
  spec: string,
  handler: (event: KeyEvent) => void,
  enabled: boolean = true
): void {
  const scopeId = useScopeId();
  const dispatch = useDispatch();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  // Scoped path — register with the nearest <FocusScope>.
  useEffect(() => {
    if (!enabled || !scopeId || !dispatch || spec.length === 0) {
      return;
    }
    return dispatch.registerHandler(scopeId, {
      spec,
      handler: (e) => handlerRef.current(e),
    });
  }, [scopeId, dispatch, spec, enabled]);

  // Unscoped fallback — plain useKey. We can't conditionally call
  // hooks, so it stays mounted but is gated to never fire while a
  // scope is in play (the scoped path above is doing the work).
  useKey(
    spec,
    (input, key) => {
      const event: KeyEvent = {
        input,
        key,
        stopPropagation: () => {},
        get isPropagationStopped() {
          return false;
        },
      };
      handlerRef.current(event);
    },
    enabled && spec.length > 0 && !scopeId
  );
}
