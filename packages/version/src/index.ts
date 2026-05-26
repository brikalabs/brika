/**
 * `@brika/version` — single source of truth for the Brika release
 * version across hub, console, and downstream updater code.
 *
 * Reads the monorepo root `package.json` once at module load. The hub
 * and console used to read their own per-package `package.json` files,
 * and we relied on `bun run bump` to keep them in sync — that's a
 * convention, not an invariant, and a missed bump silently shipped
 * mismatched versions. Centralising on the root removes the class
 * of bug entirely.
 *
 * The import below resolves to the workspace-root `package.json`
 * because this package lives at `packages/version/` and the
 * `with { type: 'json' }` attribute makes the bundler honour the
 * relative path verbatim.
 */

import rootPkg from '../../../package.json' with { type: 'json' };

export const BRIKA_VERSION: string = rootPkg.version;
