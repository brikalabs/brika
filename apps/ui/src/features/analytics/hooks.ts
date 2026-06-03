import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { Json } from '@/types';
import { analyticsApi, analyticsKeys } from './api';
import type { EventQueryParams } from './types';

/**
 * Returns a stable `capture` function for recording feature-usage events from
 * anywhere in the UI. Fire-and-forget — calling it never throws or blocks.
 *
 * @example
 * ```tsx
 * const capture = useCapture();
 * <Button onClick={() => { capture('board.created', { columns }); create(); }} />
 * ```
 */
export function useCapture(): (name: string, props?: Record<string, Json>) => void {
  return useCallback((name: string, props?: Record<string, Json>) => {
    analyticsApi.capture(name, props);
  }, []);
}

/** Aggregate stats for the analytics dashboard. */
export function useEventStats() {
  return useQuery({
    queryKey: analyticsKeys.stats,
    queryFn: () => analyticsApi.getStats(),
  });
}

/** Distinct event names with counts, for usage charts. */
export function useTopEventNames() {
  return useQuery({
    queryKey: analyticsKeys.names,
    queryFn: () => analyticsApi.getNames(),
  });
}

/** Query stored events with filters. */
export function useCaptureEvents(params: EventQueryParams) {
  return useQuery({
    queryKey: analyticsKeys.query(params),
    queryFn: () => analyticsApi.query(params),
  });
}
