import { useMutation } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { fetcher, getStreamUrl } from '@/lib/query';
import { useEventsStore } from './store';
import type { BrikaEvent } from './types';

/** Spark event structure for display */
export interface SparkEvent {
  id: string;
  type: string; // The actual spark type (e.g., "timer:timer-started")
  source: string;
  payload: unknown;
  ts: number;
}

/** API response for spark history */
interface SparkHistoryResponse {
  sparks: Array<{
    id: number;
    ts: number;
    type: string;
    source: string;
    pluginId: string | null;
    payload: unknown;
  }>;
  nextCursor: number | null;
}

/** Filter and transform events to spark events only, with history loading */
export function useSparkStream() {
  const { add, events, paused, clear, togglePaused, setHistory, initialized } = useEventsStore();

  // Fetch history on mount - always fetch fresh from DB
  useEffect(() => {
    fetcher<SparkHistoryResponse>('/api/sparks/history?limit=100')
      .then((response) => {
        // Convert DB format to BrikaEvent format for the store
        const brikaEvents: BrikaEvent[] = response.sparks.map((e) => ({
          id: String(e.id),
          type: 'spark.emit',
          source: e.pluginId ?? e.source,
          payload: {
            type: e.type,
            source: e.source,
            payload: e.payload ?? null,
          } as BrikaEvent['payload'],
          ts: e.ts,
        }));
        setHistory(brikaEvents);
      })
      .catch(() => {
        // On error, still mark as initialized so SSE events work
        setHistory([]);
      });
  }, [setHistory]);

  // SSE for live events
  useEffect(() => {
    const es = new EventSource(getStreamUrl('/api/stream/events'));
    es.addEventListener('event', (ev: MessageEvent) => {
      const event = JSON.parse(ev.data) as BrikaEvent;
      if (event.type === 'spark.emit') {
        add(event);
      }
    });
    es.onerror = () => {
      /* Connection error - auto-retry handled by EventSource */
    };
    return () => es.close();
  }, [add]);

  const sparkEvents = useMemo(() => {
    return events
      .filter((e) => e.type === 'spark.emit')
      .map((e): SparkEvent => {
        const payload = e.payload as {
          type: string;
          source: string;
          payload: unknown;
        };
        return {
          id: e.id,
          type: payload.type, // The actual spark type
          source: payload.source,
          payload: payload.payload,
          ts: e.ts,
        };
      })
      .reverse(); // Most recent first
  }, [events]);

  return {
    events: sparkEvents,
    paused,
    clear,
    togglePaused,
    initialized,
  };
}

export function useEmitEvent() {
  return useMutation({
    mutationFn: ({ type, payload }: { type: string; payload: unknown }) =>
      fetcher<BrikaEvent>('/api/sparks/emit', {
        method: 'POST',
        body: JSON.stringify({
          type,
          payload,
        }),
      }),
  });
}
