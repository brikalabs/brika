import type React from 'react';
import { useEffect, useState } from 'react';
import { fetchRecentLogs, type LogEventDto } from '../../../shared/cli/api';
import { hubFetch } from '../../../shared/cli/hub-client';
import { streamSseEvents } from '../../../shared/cli/sse';
import { formatEvent } from '../format';

export const RING_BUFFER_LINES = 5_000;

export interface LiveTail {
  readonly events: ReadonlyArray<LogEventDto>;
  readonly lines: ReadonlyArray<string>;
  readonly revision: number;
  readonly streamError: string | null;
}

/** Hydrates the ring buffer once + keeps it in sync with the live SSE
 *  stream while the hub is running. Returns the latest typed events
 *  and their formatted string mirror (the two arrays move together so
 *  consumers can use either without re-formatting). */
export function useLiveTail(hubRunning: boolean): LiveTail {
  const [events, setEvents] = useState<LogEventDto[]>([]);
  const [lines, setLines] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [streamError, setStreamError] = useState<string | null>(null);

  useEffect(() => {
    if (!hubRunning) {
      return;
    }
    let cancelled = false;
    const reportError = (e: unknown): void => {
      if (cancelled) {
        return;
      }
      if (e instanceof Error && e.name === 'AbortError') {
        return;
      }
      setStreamError(e instanceof Error ? e.message : String(e));
    };

    void hydrate(cancelled, setEvents, setLines, setRevision, reportError);
    const controller = new AbortController();
    void stream(controller, () => cancelled, setEvents, setLines, setRevision, reportError);
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [hubRunning]);

  return { events, lines, revision, streamError };
}

async function hydrate(
  cancelled: boolean,
  setEvents: React.Dispatch<React.SetStateAction<LogEventDto[]>>,
  setLines: React.Dispatch<React.SetStateAction<string[]>>,
  setRevision: React.Dispatch<React.SetStateAction<number>>,
  onError: (e: unknown) => void
): Promise<void> {
  try {
    const recent = await fetchRecentLogs();
    if (cancelled) {
      return;
    }
    setEvents(recent);
    setLines(recent.map(formatEvent));
    setRevision((r) => r + 1);
  } catch (e) {
    onError(e);
  }
}

async function stream(
  controller: AbortController,
  isCancelled: () => boolean,
  setEvents: React.Dispatch<React.SetStateAction<LogEventDto[]>>,
  setLines: React.Dispatch<React.SetStateAction<string[]>>,
  setRevision: React.Dispatch<React.SetStateAction<number>>,
  onError: (e: unknown) => void
): Promise<void> {
  try {
    const res = await hubFetch('/api/stream/logs', { signal: controller.signal });
    if (isCancelled() || !res.ok) {
      return;
    }
    for await (const event of streamSseEvents<LogEventDto>(res)) {
      if (isCancelled()) {
        return;
      }
      setEvents((prev) => clipRing([...prev, event]));
      setLines((prev) => clipRing([...prev, formatEvent(event)]));
      setRevision((r) => r + 1);
    }
  } catch (e) {
    onError(e);
  }
}

function clipRing<T>(arr: T[]): T[] {
  return arr.length > RING_BUFFER_LINES ? arr.slice(arr.length - RING_BUFFER_LINES) : arr;
}
