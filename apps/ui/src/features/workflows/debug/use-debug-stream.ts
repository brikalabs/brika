/**
 * Debug Stream Hook
 *
 * Shared hook for connecting to the workflow debug SSE stream.
 */

import { useCallback, useEffect, useState } from 'react';
import { subscribeSharedEvents } from '@/lib/shared-event-source';
import type { DebugEvent } from './types';

export interface UseDebugStreamOptions {
  /** Workflow ID to filter events for (optional) */
  workflowId?: string | null;
  /** Maximum number of events to keep in memory */
  maxEvents?: number;
  /** Whether the stream is enabled */
  enabled?: boolean;
}

export interface UseDebugStreamResult {
  /** Current events */
  events: DebugEvent[];
  /** Whether connected to the SSE stream */
  connected: boolean;
  /** Clear all events */
  clear: () => void;
}

/**
 * Hook to connect to the workflow debug SSE stream.
 *
 * @example
 * ```tsx
 * const { events, connected, clear } = useDebugStream({
 *   workflowId: 'workflow-123',
 *   maxEvents: 500,
 * });
 * ```
 */
export function useDebugStream({
  workflowId,
  maxEvents = 500,
  enabled = true,
}: UseDebugStreamOptions = {}): UseDebugStreamResult {
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [connected, setConnected] = useState(false);

  // Clear events
  const clear = useCallback(() => {
    setEvents([]);
  }, []);

  // Subscribe via the shared SSE pool so two concurrent mounts of this hook
  // (e.g. the editor + the debug side-panel) share ONE `/api/workflows/debug`
  // connection instead of each opening their own (Chrome's 6-per-origin cap).
  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return;
    }

    // Clear previous events when (re)connecting.
    setEvents([]);
    setConnected(true);

    const unsubscribe = subscribeSharedEvents(
      '/api/workflows/debug',
      (e) => {
        try {
          const data = JSON.parse(e.data) as DebugEvent;

          // Filter by workflow ID if specified.
          if (workflowId && data.workflowId !== workflowId && data.type !== 'init') {
            return;
          }

          setEvents((prev) => {
            const next = [...prev, data];
            return next.length > maxEvents ? next.slice(-maxEvents) : next;
          });
        } catch {
          // Ignore parse errors.
        }
      },
      'debug'
    );

    return () => {
      unsubscribe();
      setConnected(false);
    };
  }, [enabled, workflowId, maxEvents]);

  return {
    events,
    connected,
    clear,
  };
}
