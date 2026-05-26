import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getStreamUrl } from '@/lib/query';
import { subscribeSharedEvents } from '@/lib/shared-event-source';
import { updateApi, updateKeys } from './api';

/**
 * Subscribe to hub update notifications via SSE push.
 * Fetches current status on mount, then listens to the global event stream
 * for `update.available` events to invalidate the cache.
 */
export function useUpdateCheck() {
  const queryClient = useQueryClient();

  // Initial fetch — no polling
  const query = useQuery({
    queryKey: updateKeys.check,
    queryFn: updateApi.check,
  });

  // Listen for push notifications via the shared SSE stream. Multiple hooks
  // subscribe to the same `/api/stream/events` URL; the shared pool keeps
  // one EventSource open and fans events out, instead of three separate
  // connections eating three of the browser's six HTTP/1.1 slots.
  useEffect(
    () =>
      subscribeSharedEvents(getStreamUrl('/api/stream/events'), (ev) => {
        try {
          const event = JSON.parse(ev.data) as { type: string };
          if (event.type === 'update.available') {
            queryClient.invalidateQueries({ queryKey: updateKeys.check });
          }
        } catch {
          // Ignore malformed events
        }
      }),
    [queryClient]
  );

  return query;
}
