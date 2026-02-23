import type { Json } from '@/types';

export interface BrikaEvent {
  id: string;
  type: string;
  source: string;
  payload: Json;
  ts: number;
}
