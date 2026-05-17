/**
 * Cheap time-of-day bucketing so Brix can say "morning shift, eh?" at 8am
 * and "go to bed, friend" past midnight. Boundaries follow casual
 * intuition rather than meteorology — `late` is 0–6h because that's when
 * "are you okay?" lands; `morning` runs to noon; `evening` ends at 22h.
 */

export type TimeOfDay = 'late' | 'morning' | 'afternoon' | 'evening' | 'night';

export function timeOfDay(now: Date = new Date()): TimeOfDay {
  const h = now.getHours();
  if (h < 6) { return 'late'; }
  if (h < 12) { return 'morning'; }
  if (h < 18) { return 'afternoon'; }
  if (h < 22) { return 'evening'; }
  return 'night';
}
