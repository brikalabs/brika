/**
 * Global emote bus.
 *
 *   <EmoteProvider>
 *     <App />
 *   </EmoteProvider>
 *
 *   const emote = useEmote();
 *   emote.play('celebrate');
 *   emote.on('hub.deploy', 'wave');   // auto-trigger by event name
 *   emote.fire('hub.deploy');
 *
 * `play(name, { queue: true })` queues behind the current emote.
 * `play(name)` replaces only if the new emote's priority is ≥ the
 * current one. `cancel()` clears the queue and returns Brix to idle.
 * The stage calls `next()` when its current emote finishes its hold,
 * popping the queue or returning to idle.
 *
 * The provider doesn't run any timers itself — it's a pure pub/sub.
 * Timing for `hold` lives in `BrixStage`, which owns the timeline
 * clock and knows when an emote has "really" finished.
 */

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
import { EMOTE_LIBRARY, type EmoteDef } from './emotes';

export interface PlayOptions {
  /** Queue behind the current emote instead of replacing. */
  readonly queue?: boolean;
  /** Override the emote definition's priority for this play. */
  readonly priority?: number;
}

export interface EmoteApi {
  readonly current: EmoteDef | null;
  /** Play `name` — replaces current if priority allows, else queued (when `queue` is set). */
  play(name: string, opts?: PlayOptions): void;
  /** Clear the queue and return to idle. */
  cancel(): void;
  /** Internal: signal that the current emote (timeline + hold) has finished. */
  next(): void;
  /** Auto-fire `name` whenever someone calls `fire(event)`. Returns an unsubscribe fn. */
  on(event: string, name: string): () => void;
  /** Trigger every handler registered for `event`. */
  fire(event: string): void;
  /** Number of queued emotes (excluding `current`). */
  readonly pending: number;
}

const NOOP = (): void => {
  /* default API used until <EmoteProvider> mounts */
};
const NULL_API: EmoteApi = {
  current: null,
  play: NOOP,
  cancel: NOOP,
  next: NOOP,
  on: () => NOOP,
  fire: NOOP,
  pending: 0,
};

const EmoteContext = createContext<EmoteApi>(NULL_API);

export interface EmoteProviderProps {
  readonly children: ReactNode;
  /** Custom emote library. Defaults to the built-in catalog. */
  readonly library?: Readonly<Record<string, EmoteDef>>;
}

function withPriorityOverride(def: EmoteDef, opts?: PlayOptions): EmoteDef {
  if (opts?.priority === undefined) {
    return def;
  }
  return { ...def, priority: opts.priority };
}

export function EmoteProvider({
  children,
  library = EMOTE_LIBRARY,
}: Readonly<EmoteProviderProps>): React.ReactElement {
  const [current, setCurrent] = useState<EmoteDef | null>(null);
  const [pending, setPending] = useState(0);
  const currentRef = useRef<EmoteDef | null>(null);
  const queue = useRef<EmoteDef[]>([]);
  const handlers = useRef<Map<string, string[]>>(new Map());

  const commitCurrent = useCallback((next: EmoteDef | null) => {
    currentRef.current = next;
    setCurrent(next);
  }, []);

  const syncPending = useCallback(() => {
    setPending(queue.current.length);
  }, []);

  const play = useCallback(
    (name: string, opts?: PlayOptions) => {
      const def = library[name];
      if (!def) {
        return;
      }
      const candidate = withPriorityOverride(def, opts);
      const cur = currentRef.current;
      if (!cur) {
        commitCurrent(candidate);
        return;
      }
      if (opts?.queue) {
        queue.current.push(candidate);
        syncPending();
        return;
      }
      const curP = cur.priority ?? 0;
      const newP = candidate.priority ?? 0;
      if (newP >= curP) {
        commitCurrent(candidate);
      }
    },
    [library, commitCurrent, syncPending]
  );

  const cancel = useCallback(() => {
    queue.current = [];
    syncPending();
    commitCurrent(null);
  }, [commitCurrent, syncPending]);

  const next = useCallback(() => {
    const head = queue.current.shift() ?? null;
    syncPending();
    commitCurrent(head);
  }, [commitCurrent, syncPending]);

  const on = useCallback((event: string, name: string) => {
    const list = handlers.current.get(event) ?? [];
    list.push(name);
    handlers.current.set(event, list);
    return () => {
      const arr = handlers.current.get(event);
      if (!arr) {
        return;
      }
      const idx = arr.lastIndexOf(name);
      if (idx >= 0) {
        arr.splice(idx, 1);
      }
    };
  }, []);

  const fire = useCallback(
    (event: string) => {
      const arr = handlers.current.get(event);
      if (!arr || arr.length === 0) {
        return;
      }
      // Fire the most-recently-registered handler — matches typical
      // "scoped subscription" semantics where a deeper child overrides
      // a parent's binding.
      const name = arr.at(-1);
      if (name) {
        play(name);
      }
    },
    [play]
  );

  const api: EmoteApi = useMemo(
    () => ({ current, play, cancel, next, on, fire, pending }),
    [current, play, cancel, next, on, fire, pending]
  );

  return <EmoteContext.Provider value={api}>{children}</EmoteContext.Provider>;
}

export function useEmote(): EmoteApi {
  return useContext(EmoteContext);
}

/**
 * Subscribe an emote to an event for the lifetime of the calling
 * component. Wraps `api.on(event, name)` with `useEffect` so the
 * subscription is torn down automatically on unmount — the recommended
 * way to bind emotes to events from React code.
 *
 *   useEmoteOn('hub.deploy', 'celebrate');
 *
 * Pass `null` for either argument to disable the binding (useful
 * when the event or emote name is computed and may be absent).
 */
export function useEmoteOn(event: string | null, name: string | null): void {
  const api = useEmote();
  useEffect(() => {
    if (!event || !name) {
      return;
    }
    return api.on(event, name);
  }, [api, event, name]);
}
