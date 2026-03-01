import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getStreamUrl } from '@/lib/query';
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

  // Listen for push notifications via existing /api/stream/events SSE
  useEffect(() => {
    const es = new EventSource(getStreamUrl('/api/stream/events'));
    es.addEventListener('event', (ev: MessageEvent) => {
      try {
        const event = JSON.parse(ev.data) as {
          type: string;
        };
        if (event.type === 'update.available') {
          queryClient.invalidateQueries({
            queryKey: updateKeys.check,
          });
        }
      } catch {
        // Ignore malformed events
      }
    });
    return () => es.close();
  }, [queryClient]);

  return query;
}
