/**
 * CLI version — read from package.json so a single bump propagates
 * everywhere (Brix header, `brika version`, brand line, etc.).
 */

import pkg from '../package.json' with { type: 'json' };

export const CLI_VERSION: string = pkg.version;
