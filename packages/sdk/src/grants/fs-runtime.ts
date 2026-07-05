/**
 * `BrikaFsRuntime` (`@brika/sdk/grants/fs-runtime`). The pinned contract lives
 * in `@brika/schema/fs-runtime` (the leaf package) so the compiler's
 * `node:fs/promises` shim types against it without depending on the SDK; this
 * re-export keeps the SDK-side import path the prelude and grant specs use.
 */

export type { BrikaFsRuntime } from '@brika/schema/fs-runtime';
