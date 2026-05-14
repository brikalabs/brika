/**
 * Force a re-render after every supervisor `state` event so the tree
 * reads fresh `supervisor.list()`. Multiple events within a single
 * frame collapse into one render — critical for chatty children.
 *
 * Shutdown / shutting-down events are NOT throttled here — `useShutdownBridge`
 * subscribes to those separately so the overlay appears immediately.
 *
 * Also calls `supervisor.start()` once on mount.
 */

import { useEffect, useReducer } from 'react';
import type { Supervisor } from '../../supervisor';

/**
 * Frame budget for log-driven re-renders. Chatty services (vite's
 * startup, HMR storms, bun's transform progress) emit hundreds of
 * lines per second. Without throttling, each line triggers a full ink
 * reconciliation + yoga layout — pegs CPU and feels laggy.
 *
 * 33ms ≈ 30fps. Empirically this is the sweet spot: scroll/log
 * updates still feel real-time, CPU stays in single digits even
 * during HMR bursts.
 */
const RENDER_FRAME_MS = 1000 / 30;

export function useSupervisorTick(supervisor: Supervisor): void {
  // Canonical force-render pattern. We only need a function that
  // triggers a render — the counter value itself is never read, so
  // useReducer is a cleaner fit than `useState`.
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    let scheduled = false;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = (): void => {
      pendingTimer = null;
      scheduled = false;
      forceRender();
    };
    const off = supervisor.subscribe((event) => {
      // Only state events drive scheduled re-renders. Lifecycle events
      // (shutting-down, shutdown) are handled by useShutdownBridge and
      // must not be delayed by the frame budget.
      if (event.kind !== 'state') {
        return;
      }
      if (scheduled) {
        return;
      }
      scheduled = true;
      pendingTimer = setTimeout(flush, RENDER_FRAME_MS);
    });
    supervisor.start();
    return () => {
      off();
      if (pendingTimer !== null) {
        clearTimeout(pendingTimer);
      }
    };
  }, [supervisor]);
}
