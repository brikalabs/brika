/**
 * CLI version — read from package.json so a single bump propagates
 * everywhere (Brix header, `brika version`, brand line, etc.).
 *
 * `bun run bump` keeps every app's `version` field in sync with the
 * root, so importing the local one here is equivalent to importing
 * the root.
 */

import pkg from '../package.json' with { type: 'json' };

export const CLI_VERSION: string = pkg.version;
