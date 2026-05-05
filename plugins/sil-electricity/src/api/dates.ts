/**
 * Date-range and granularity helpers for the Cube.js MeterReading queries.
 */

import type { Granularity, Period } from '../types';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function dateRangeForPeriod(period: Period): [string, string] {
  const end = new Date();
  const start = new Date(end);
  switch (period) {
    case '24h':
      // The Cube endpoint only accepts date-only ranges, even for 'minute'
      // granularity. For 24h we ask for yesterday + today and rely on the
      // smart meter only having the most recent ~24h of 15-min slots.
      start.setDate(end.getDate() - 1);
      break;
    case '7d':
      start.setDate(end.getDate() - 7);
      break;
    case '30d':
      start.setDate(end.getDate() - 30);
      break;
    case '12m':
      start.setMonth(end.getMonth() - 12);
      break;
    case '24m':
      start.setMonth(end.getMonth() - 24);
      break;
  }
  return [isoDate(start), isoDate(end)];
}

export function granularityForPeriod(period: Period): Granularity {
  if (period === '24h') return 'minute';
  if (period === '7d' || period === '30d') return 'day';
  return 'month';
}
