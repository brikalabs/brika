/**
 * CLI version — pulled from `@brika/version`, which resolves the
 * monorepo root `package.json` at build time. Keeps the console
 * binary and the hub on the same version with no manual sync.
 */

import { BRIKA_VERSION } from '@brika/version';

export const CLI_VERSION: string = BRIKA_VERSION;
