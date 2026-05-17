import { describe, expect, test } from 'bun:test';
import { COPYRIGHT_START_YEAR, copyrightLine } from './copyright';

describe('copyrightLine', () => {
  test('shows a single year when the current year matches the start year', () => {
    const now = new Date(`${COPYRIGHT_START_YEAR}-06-15T00:00:00Z`);
    expect(copyrightLine(now)).toBe(`© ${COPYRIGHT_START_YEAR} Brika Labs`);
  });

  test('expands into a range once the current year is past the start year', () => {
    const future = new Date(`${COPYRIGHT_START_YEAR + 3}-01-01T00:00:00Z`);
    expect(copyrightLine(future)).toBe(
      `© ${COPYRIGHT_START_YEAR}-${COPYRIGHT_START_YEAR + 3} Brika Labs`
    );
  });

  test('treats earlier-than-start as a single-year line (no time-travel range)', () => {
    const past = new Date(`${COPYRIGHT_START_YEAR - 1}-12-31T00:00:00Z`);
    expect(copyrightLine(past)).toBe(`© ${COPYRIGHT_START_YEAR} Brika Labs`);
  });
});
