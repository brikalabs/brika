import type { Column } from 'drizzle-orm';
import { eq, gt, gte, inArray, lt, lte } from 'drizzle-orm';

export function oneOrMany<T>(col: Column, value: T | T[] | undefined) {
  if (value === undefined || value === null) { return undefined; }
  return Array.isArray(value) ? inArray(col, value) : eq(col, value);
}

export function cursorFilter(col: Column, cursor: number | undefined, order: 'asc' | 'desc') {
  if (cursor === undefined) { return undefined; }
  return order === 'desc' ? lt(col, cursor) : gt(col, cursor);
}

export function startTsFilter(col: Column, ts?: number) {
  if (ts === undefined) { return undefined; }
  return gte(col, ts);
}

export function endTsFilter(col: Column, ts?: number) {
  if (ts === undefined) { return undefined; }
  return lte(col, ts);
}
