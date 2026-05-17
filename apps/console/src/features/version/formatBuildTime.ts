/**
 * Render a build timestamp for display in `brika version`.
 *
 * Input is the macro-captured ISO string (e.g. `2026-05-17T09:13:43.123Z`).
 * Output trims the fractional seconds and the `T` separator and labels
 * the timezone explicitly: `2026-05-17 09:13 UTC`. Falls back to the
 * raw input on parse failure so a malformed value still surfaces
 * somewhere rather than vanishing.
 */
export function formatBuildTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  const yyyy = d.getUTCFullYear();
  const mm = pad(d.getUTCMonth() + 1);
  const dd = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const min = pad(d.getUTCMinutes());
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
