/**
 * Cube.js MeterReading query: build, fetch, and parse into ConsumptionPoint[].
 */

import type { ConsumptionPoint, Granularity, Period } from '../types';
import { dateRangeForPeriod, granularityForPeriod } from './dates';
import { BASE, DIAMOND, GOTO } from './internals';

interface CubeQuery {
  measures: string[];
  segments: string[];
  timeDimensions: { dimension: string; granularity: string; dateRange: [string, string] }[];
  order: unknown[];
  limit: number;
  dimensions: string[];
  filters: { member: string; operator: string; values: string[] }[];
}

function buildQuery(granularity: Granularity, dateRange: [string, string]): CubeQuery {
  return {
    measures: ['MeterReading.mrReadingvalue'],
    segments: ['MeterReading.standardGroup'],
    timeDimensions: [
      { dimension: 'MeterReading.mrReadingtimestamp', granularity, dateRange },
    ],
    order: [],
    limit: 50000,
    dimensions: ['MeterReading.typehour'],
    filters: [
      { member: 'MeterReading.mrProfilerole', operator: 'contains', values: ['E003', 'E001'] },
      {
        member: 'MeterReading.mrReadingstatus',
        operator: 'equals',
        values: ['IU012', 'IU015', 'IU013', 'IU016'],
      },
      {
        member: 'MeterReading.typehour',
        operator: 'equals',
        values: ['hs', 'hp', 'hc', 'pr'],
      },
    ],
  };
}

interface CubeDataRow {
  'MeterReading.typehour': string;
  'MeterReading.mrReadingtimestamp': string;
  'MeterReading.mrReadingvalue': string;
}

interface CubeResponse {
  results: { data: CubeDataRow[] }[];
}

function isCubeResponse(value: unknown): value is CubeResponse {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj['results'])) return false;
  const first = (obj['results'] as unknown[])[0];
  if (typeof first !== 'object' || first === null) return false;
  return Array.isArray((first as Record<string, unknown>)['data']);
}

function aggregatePoints(rows: CubeDataRow[], granularity: Granularity): ConsumptionPoint[] {
  const timestampKey = `MeterReading.mrReadingtimestamp.${granularity}` as keyof CubeDataRow;
  const map = new Map<string, { total: number; injection: number }>();

  for (const row of rows) {
    const ts = row[timestampKey] ?? row['MeterReading.mrReadingtimestamp'];
    const value = Number.parseFloat(row['MeterReading.mrReadingvalue']) || 0;
    const typehour = row['MeterReading.typehour'];
    const entry = map.get(ts) ?? { total: 0, injection: 0 };
    if (typehour === 'pr') {
      entry.injection += value;
    } else {
      entry.total += value;
    }
    map.set(ts, entry);
  }

  return [...map.entries()]
    .map(([timestamp, { total, injection }]) => ({ timestamp, total, injection }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function fetchConsumption(
  cookie: string,
  period: Period,
): Promise<ConsumptionPoint[]> {
  const granularity = granularityForPeriod(period);
  const dateRange = dateRangeForPeriod(period);
  const query = buildQuery(granularity, dateRange);

  const url = new URL(DIAMOND);
  url.searchParams.set('query', JSON.stringify(query));
  url.searchParams.set('queryType', 'multi');

  const res = await fetch(url.toString(), {
    headers: { Cookie: cookie, Referer: `${BASE}${GOTO}` },
  });

  if (res.status === 401 || res.status === 403) throw new Error('AUTH_FAILED');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  // HTML response means we were redirected to the login page (session expired)
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) throw new Error('AUTH_FAILED');

  const json: unknown = await res.json();
  if (!isCubeResponse(json)) throw new Error('INVALID_RESPONSE');

  return aggregatePoints(json.results[0]?.data ?? [], granularity);
}
