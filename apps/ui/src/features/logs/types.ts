import type { Json } from '@/types';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogSource =
  | 'hub'
  | 'plugin'
  | 'installer'
  | 'registry'
  | 'stderr'
  | 'workflow'
  | 'events'
  | 'http'
  | 'i18n'
  | 'state'
  | 'updates';

export interface LogError {
  name: string;
  message: string;
  stack?: string;
  cause?: string;
}

export interface LogEvent {
  ts: number;
  level: LogLevel;
  source: LogSource;
  pluginName?: string;
  message: string;
  meta?: Record<string, Json>;
  error?: LogError;
}
