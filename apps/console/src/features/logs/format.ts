import type { LogEventDto } from '../../shared/cli/api';
import type { LogSearchControls } from './search/useLogSearch';

export function formatEvent(e: LogEventDto): string {
  const ts = new Date(e.ts).toISOString().slice(11, 19);
  const level = e.level.padEnd(5);
  const source = e.pluginName ? `${e.source}/${e.pluginName}` : e.source;
  return `${ts}  ${level} ${source.padEnd(20)} ${e.message}`;
}

export function levelColor(level: string): string | undefined {
  switch (level.toLowerCase()) {
    case 'fatal':
    case 'error':
      return 'red';
    case 'warn':
    case 'warning':
      return 'yellow';
    case 'info':
      return 'cyan';
    case 'debug':
    case 'trace':
      return 'gray';
    default:
      return undefined;
  }
}

/** Compose the LogPane label so the user can see the active query +
 *  match position at a glance — fed directly into `<LogPane>`'s
 *  existing header so we don't have to add another status row. */
export function buildLabel(search: LogSearchControls): string {
  if (search.mode === 'loading') {
    return search.query ? `hub · /${search.query}/ · searching…` : 'hub · searching…';
  }
  if (search.query.length > 0) {
    const n = search.results.length;
    const pos = n === 0 ? 'no matches' : `${search.currentIdx + 1}/${n}`;
    return `hub · /${search.query}/ ${pos}`;
  }
  return 'hub';
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
