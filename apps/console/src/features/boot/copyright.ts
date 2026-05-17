/**
 * Copyright line shown on the boot splash.
 *
 * The range collapses to a single year until the runtime is in a
 * calendar year later than the project's first-published year — that
 * way the line stays accurate without anyone touching code each Jan 1.
 *
 * Bump `COPYRIGHT_START_YEAR` only if the project itself re-incorporates
 * under a new entity (the year of first publication doesn't change just
 * because we cut a new release).
 */

export const COPYRIGHT_START_YEAR = 2026;

export function copyrightLine(now: Date = new Date()): string {
  const current = now.getFullYear();
  const range =
    current > COPYRIGHT_START_YEAR
      ? `${COPYRIGHT_START_YEAR}-${current}`
      : `${COPYRIGHT_START_YEAR}`;
  return `© ${range} Brika Labs`;
}
