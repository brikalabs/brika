/**
 * CLI version — sourced from the same build-time macro the hub uses,
 * so a single `BRIKA_VERSION` env var in CI populates both the CLI
 * display (Brix header, `brika version`, settings tile) AND the hub's
 * `brikaContext.version` (used by the update checker). Local dev falls
 * back to `apps/console/package.json`, which `bun run bump` keeps in
 * lockstep with the rest of the workspace.
 */

import { getBrikaVersion } from './features/version/buildInfo.macro' with { type: 'macro' };

export const CLI_VERSION: string = getBrikaVersion();
