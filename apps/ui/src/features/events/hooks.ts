import type { BrikaEvent } from '@brika/shared';
import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { fetcher, getStreamUrl } from '@/lib/query';
import { useEventsStore } from './store';

export function useEventStream() {
  const { add, events, paused, clear, togglePaused } = useEventsStore();

  useEffect(() => {
    const es = new EventSource(getStreamUrl('/api/stream/events'));
    es.addEventListener('event', (ev: MessageEvent) => add(JSON.parse(ev.data)));
    es.onerror = () => {};
    return () => es.close();
  }, [add]);

  return { events, paused, clear, togglePaused };
}

export function useEmitEvent() {
  return useMutation({
    mutationFn: ({ type, payload }: { type: string; payload: unknown }) =>
      fetcher<BrikaEvent>('/api/events', {
        method: 'POST',
        body: JSON.stringify({ type, payload }),
      }),
  });
}
