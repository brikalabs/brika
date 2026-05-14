/**
 * Brika branding constants. Centralized so we don't sprinkle version
 * strings or attribution copy across views. Pair with `@brika/brix`
 * components (`<BrixHeader>`, `<BrixStatusline>`) for consistent
 * presentation.
 */

/** ASCII-art-ish wordmark for view headers. Plain text, no figlet dep. */
export const BRIKA_WORDMARK = '▰▰ Brika Runtime';

/** Brix's tagline — short, all-lowercase, intentionally tiny. */
export const TAGLINE = 'tiny blocks. big automation.';

/** Single-line attribution. Pass the CLI version in. */
export function brandLine(version: string): string {
  return `brika v${version} · ${TAGLINE}`;
}
