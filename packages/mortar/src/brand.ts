/**
 * Mortar branding constants. Centralized so we don't sprinkle version
 * strings or attribution copy across the views. `MORTAR_VERSION` is
 * read from `package.json` so a single bump there propagates everywhere.
 */

import pkg from '../package.json' with { type: 'json' };

export const MORTAR_VERSION: string = pkg.version;

/** ASCII-art-ish wordmark for view headers. Plain text, no figlet dep. */
export const MORTAR_WORDMARK = '▰▰ mortar';

/** Single-line attribution shown in footers. */
export const BRAND_LINE = `mortar v${MORTAR_VERSION} · built by the Brika Labs team`;
