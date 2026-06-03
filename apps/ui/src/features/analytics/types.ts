import type { Json } from '@/types';

export type CaptureSource = 'hub' | 'plugin' | 'ui' | 'cli';

export interface CaptureEvent {
  ts: number;
  name: string;
  source: CaptureSource;
  distinctId?: string;
  userId?: string;
  pluginName?: string;
  props?: Record<string, Json>;
}

export interface StoredCaptureEvent extends CaptureEvent {
  id: number;
}

export interface EventQueryParams {
  name?: string | string[];
  source?: CaptureSource | CaptureSource[];
  pluginName?: string;
  distinctId?: string;
  userId?: string;
  search?: string;
  startTs?: number;
  endTs?: number;
  cursor?: number;
  limit?: number;
  order?: 'asc' | 'desc';
}

export interface TimeBucket {
  bucket: number;
  count: number;
}

export interface TimeSeriesResult {
  bucketMs: number;
  buckets: TimeBucket[];
}

export interface TimeSeriesParams {
  bucketMs?: number;
  name?: string | string[];
  source?: CaptureSource | CaptureSource[];
  pluginName?: string;
  startTs?: number;
  endTs?: number;
}

export interface EventQueryResult {
  events: StoredCaptureEvent[];
  nextCursor: number | null;
}

export interface EventNameCount {
  name: string;
  count: number;
}

export interface EventStats {
  total: number;
  ringBufferSize: number;
  sources: CaptureSource[];
  plugins: string[];
  remoteForwarding: boolean;
  /** Active forwarding provider name (e.g. "posthog"), or null when off. */
  remoteForwardingProvider: string | null;
}
