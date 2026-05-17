import { describe, expect, test } from 'bun:test';
import { timeOfDay } from './timeOfDay';

function at(hour: number): Date {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d;
}

describe('timeOfDay', () => {
  test.each([
    [0, 'late'],
    [3, 'late'],
    [5, 'late'],
    [6, 'morning'],
    [9, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [15, 'afternoon'],
    [17, 'afternoon'],
    [18, 'evening'],
    [21, 'evening'],
    [22, 'night'],
    [23, 'night'],
  ] as const)('h=%i → %s', (hour, expected) => {
    expect(timeOfDay(at(hour))).toBe(expected);
  });
});
