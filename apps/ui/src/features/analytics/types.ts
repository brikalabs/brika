import type { Json } from '@/types';

export type CaptureSource = 'hub' | 'plugin' | 'ui' | 'cli';

export interface CaptureEvent {
  ts: number;
  name: string;
  source: CaptureSource;
  distinctId?: string;
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
  search?: string;
  startTs?: number;
  endTs?: number;
  cursor?: number;
  limit?: number;
  order?: 'asc' | 'desc';
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
}
