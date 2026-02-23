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

/** Available log levels as a constant array */
export const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

/** Available log sources as a constant array */
export const LOG_SOURCES: LogSource[] = [
  'hub',
  'plugin',
  'installer',
  'registry',
  'stderr',
  'workflow',
  'events',
  'http',
  'i18n',
  'state',
  'updates',
];

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
