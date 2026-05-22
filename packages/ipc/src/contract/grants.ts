/**
 * Grants Contract
 *
 * Wire-level RPCs for the typed grant system. Two endpoints suffice for
 * every `ctx.foo.bar(args)` call a plugin makes — the registry layer in
 * `@brika/grants` carries the typing on both sides.
 */

import { z } from 'zod';
import { rpc } from '../define';

// ─── Json placeholder ────────────────────────────────────────────────────────
// args/result for grantRequest are validated per-grant in @brika/grants —
// the wire schema is intentionally untyped. Each grant spec carries its
// own Zod schemas; double-validating here would only duplicate the work.

const Json: z.ZodType<unknown> = z.unknown();

// ─── Grant entry shape ──────────────────────────────────────────────────────
// Note: the hub-side `GrantEntry` carries `scope`, but the plugin process
// has no reason to read its own scope (the hub re-fetches it from its
// vector at dispatch time). We deliberately omit `scope` from the wire
// payload so a compromised plugin can't introspect its scope without an
// extra round-trip — a minor surface reduction under the RCE threat model.

const GrantEntryWire = z.object({
  id: z.string(),
  ctxPath: z.string(),
});

// ─── RPCs ────────────────────────────────────────────────────────────────────

/**
 * Plugin invokes a grant. Single chokepoint for every `ctx.foo.bar(args)`.
 *
 *   { id: 'dev.brika.net.fetch', args: { url: '…' } }
 *     → { result: { status: 200, body: '…' } }
 *
 * Errors round-trip as typed `BrikaError` envelopes via the IPC error
 * handling layer (`@brika/errors`).
 */
export const grantRequest = rpc(
  'grant.request',
  z.object({
    id: z.string(),
    args: Json,
  }),
  z.object({
    result: Json,
  })
);

/**
 * Plugin fetches its grant vector at startup. The prelude calls this once,
 * installs the result as `globalThis.__brika_grants`, then `ctx` reads from
 * it on every call to short-circuit denied paths without IPC.
 *
 * A future revocation event (`grantVectorUpdate`, push from hub) will let
 * the prelude swap the vector mid-flight; the contract above doesn't change
 * for that.
 */
export const getGrantVector = rpc(
  'grant.vector.get',
  z.object({}),
  z.object({
    grants: z.array(GrantEntryWire),
  })
);
