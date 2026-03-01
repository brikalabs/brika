/**
 * Debug Stream Hook
 *
 * Shared hook for connecting to the workflow debug SSE stream.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
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
  const eventSourceRef = useRef<EventSource | null>(null);

  // Clear events
  const clear = useCallback(() => {
    setEvents([]);
  }, []);

  // Connect to SSE
  useEffect(() => {
    if (!enabled) {
      // Clean up when disabled
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      setConnected(false);
      return;
    }

    // Clear previous events when connecting
    setEvents([]);

    // Connect to SSE
    const es = new EventSource('/api/workflows/debug');
    eventSourceRef.current = es;

    es.addEventListener('debug', (e) => {
      try {
        const data = JSON.parse(e.data) as DebugEvent;

        // Filter by workflow ID if specified
        if (workflowId && data.workflowId !== workflowId && data.type !== 'init') {
          return;
        }

        setEvents((prev) => {
          const next = [
            ...prev,
            data,
          ];
          return next.length > maxEvents ? next.slice(-maxEvents) : next;
        });
      } catch {
        // Ignore parse errors
      }
    });

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [
    enabled,
    workflowId,
    maxEvents,
  ]);

  return {
    events,
    connected,
    clear,
  };
}
