/**
 * Terminal dimensions that update on resize. ink's `useStdout()` gives
 * us the stream but doesn't re-render on resize — we listen explicitly.
 *
 * The resize subscription is shared across every caller through a
 * module-level store. Node's default `MaxListeners` is 10, and several
 * primitives (AppShell, DebugOverlay, LogPane, …) all want the size —
 * registering one listener each blows past the limit and triggers the
 * `MaxListenersExceededWarning`. With the shared store there's a single
 * `stdout.on('resize')` registration regardless of consumer count.
 *
 * Defaults of 80×24 mirror what most terminals fall back to when the
 * dimensions are unavailable (CI, pipes, MinTTY edge cases).
 */

import { useStdout } from 'ink';
import { useState, useSyncExternalStore } from 'react';

export interface TerminalSize {
  readonly columns: number;
  readonly rows: number;
}

type Stdout = NodeJS.WriteStream;

interface SizeStore {
  readonly subscribe: (l: () => void) => () => void;
  readonly get: () => TerminalSize;
}

const STORES = new WeakMap<Stdout, SizeStore>();

function getStore(stdout: Stdout): SizeStore {
  const existing = STORES.get(stdout);
  if (existing) {
    return existing;
  }
  // One mutable snapshot per stream, replaced on resize so
  // `useSyncExternalStore` sees referential equality flip.
  let snapshot: TerminalSize = {
    columns: stdout.columns ?? 80,
    rows: stdout.rows ?? 24,
  };
  const listeners = new Set<() => void>();
  const onResize = (): void => {
    snapshot = {
      columns: stdout.columns ?? 80,
      rows: stdout.rows ?? 24,
    };
    for (const l of listeners) {
      l();
    }
  };
  stdout.on('resize', onResize);
  const store: SizeStore = {
    subscribe(l) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    get: () => snapshot,
  };
  STORES.set(stdout, store);
  return store;
}

const DEFAULT_SIZE: TerminalSize = { columns: 80, rows: 24 };

export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();
  // Fall back to a fixed snapshot when there's no stream (tests, pipes).
  // useSyncExternalStore needs stable subscribe/get refs — `useState`
  // memoizes the per-stream store across renders.
  const [store] = useState<SizeStore | null>(() => (stdout ? getStore(stdout) : null));
  return useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.get : getDefault,
    store ? store.get : getDefault
  );
}

function noopSubscribe(): () => void {
  return () => {
    /* nothing to unsubscribe from */
  };
}

function getDefault(): TerminalSize {
  return DEFAULT_SIZE;
}
