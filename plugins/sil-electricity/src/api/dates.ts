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
      // The Cube endpoint only accepts date-only ranges, even at 'minute'
      // granularity. SIL publishes 15-minute readings with a multi-day lag, so
      // "yesterday + today" is routinely empty. Fetch the last week so the most
      // recent readings are always in range; the live brick then slices to the
      // latest window it actually finds.
      start.setDate(end.getDate() - 7);
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
  if (period === '24h') {
    return 'minute';
  }
  if (period === '7d' || period === '30d') {
    return 'day';
  }
  return 'month';
}
