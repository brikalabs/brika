# Permissions & Grants

A plugin's `permissions` array in `package.json` lists the host capabilities it wants. At runtime the hub enforces those permissions through the **grant dispatcher** — every gated operation goes through one place, runs against a typed Zod schema, and is logged with redacted args/results.

Key files:

* `apps/hub/src/runtime/plugins/grants/dispatch.ts` — server-side dispatcher.
* `apps/hub/src/runtime/plugins/grants/vector.ts` — bitset representation of granted permissions.
* `packages/grants/` — grant catalogue (per-grant args/result schemas + handlers).
* `packages/permissions/` — permission model + scope definitions.
* `packages/sdk/src/grants/*.ts` — plugin-side proxies for `fetch`, `Bun.file`, `getSecret`, etc.

## The flow

```
Plugin calls fetch(url)
       │
       ▼ (SDK has replaced the global fetch with a grant-aware proxy)
Plugin SDK builds a grantRequest IPC RPC: { grant: 'dev.brika.net.fetch', args: { url, init } }
       │
       ▼ IPC
Hub grant dispatcher
       │
       ├─ Lookup grant in catalogue (find handler + schemas + required permission)
       ├─ Check plugin's permission vector for the required permission
       ├─ Validate args with Zod
       ├─ Call the handler
       ├─ Audit log (with redaction)
       └─ Return result via IPC
       │
       ▼
Plugin SDK resolves the original fetch() promise with the result
```

The plugin author never sees the grant machinery. `fetch`, `Bun.file`, `import 'node:fs/promises'`, `new WebSocket`, `getSecret` — all of these flow through the same dispatcher.

## Permission vector

The plugin's granted permissions are encoded as a compact bitset (the **permission vector**). Each bit corresponds to a permission ID. The dispatcher checks the bit in O(1).

The vector is computed from:

1. The plugin's declared permissions (`package.json#permissions`).
2. The user's persisted grants (the user can deny some declared permissions; the hub respects those denials).
3. Built-in implicit permissions (every plugin can write to its own data directory).

Vectors are cached in the plugin process for hot-path performance — the SDK reads the bit before sending the IPC, so a denied call fails locally without a round-trip. The hub re-checks server-side as defence in depth.

When the user toggles a permission in the UI, the hub recomputes the vector and pushes the update via IPC. No plugin restart required.

## Grant catalogue

Each grant has:

* A stable ID (`dev.brika.net.fetch`, `dev.brika.fs.read-file`, `dev.brika.secrets.get`).
* An args schema (Zod).
* A result schema (Zod).
* A required permission (one of `net`, `fs.read`, `fs.write`, `secrets`, `location`, …).
* A handler function — the hub-side implementation.
* Optional redaction functions — what to omit from the audit log.

Examples (representative — exact IDs may differ):

| Grant | Permission | Handler |
|---|---|---|
| `net.fetch` | `net` | Calls global `fetch`, returns response (status, headers, body) |
| `net.dns-lookup` | `net` | Calls `Bun.dns.lookup` |
| `ws.connect` | `ws` | Opens a `WebSocket`, streams messages back via `streamEvent` IPC |
| `fs.read-file` | `fs.read` | Reads a file under a granted scope |
| `fs.write-file` | `fs.write` | Writes a file under a granted scope |
| `secrets.get` | `secrets` | Reads from the OS keychain in the plugin's namespace |
| `secrets.set` | `secrets` | Writes to the OS keychain |
| `location.get` | `location` | Returns the hub's configured location |

The list grows over time; permissions deliberately do not, so adding a grant doesn't require user re-approval — the new grant rides on an existing permission.

## Filesystem scope

`fs.read` and `fs.write` are about *whether* the plugin can use the fs API at all. *Where* the plugin can read or write is a separate, narrower scope: the user chooses paths in the UI and the hub builds an allowlist. Calls outside the allowlist (path traversal, symlinks escaping the scope) are rejected at the grant boundary before the handler runs.

The plugin's own `data/` directory (under `.brika/plugins/<uid>/data/`) is always accessible without a grant.

## Audit logging

Every grant call is logged with:

* Timestamp.
* Plugin UID.
* Grant ID.
* Result kind (`ok`, `denied`, `error`).
* Args + result, after redaction.

Redaction is per-grant. For `net.fetch` the URL is logged but auth headers stripped; for `secrets.get` the key is logged but the value omitted; for `fs.read-file` the path is logged. The audit log feeds into the regular log stream — searchable from the **Logs** UI.

## Why a separate dispatcher?

It would be tempting to give each grant its own IPC message and let the plugin call it directly. The single dispatcher exists because:

* Adding a grant is one entry in the catalogue. No new IPC contract.
* Permission checks live in one place — easy to audit, hard to bypass by mistake.
* Args/result validation is uniform.
* The audit log captures everything without grants having to opt in.
* The plugin SDK can wrap every grant the same way (`async (...args) => callGrant(id, args)`).

## Streams

Some grants are stateful — a WebSocket, a file watch, a long-running connection. These return immediately with a stream handle, and subsequent events flow back to the plugin as `streamEvent` IPC messages. The dispatcher tracks the open stream's owner so closing the plugin disposes the underlying resource.

## Permission denied error

When a grant is called without its required permission, the dispatcher returns `BrikaError` with code `PERMISSION_DENIED`. The SDK throws on the plugin side. The error includes the grant ID and the missing permission name so the developer can fix the manifest.

## See also

* **[Permissions](../plugins/permissions.md)** — author-facing.
* **[Secret Store](secret-store.md)** — backend for the `secrets` grant.
* **[IPC Protocol](ipc-protocol.md)** — `grantRequest` and `streamEvent` messages.
* **[Plugin Supervisor](plugin-supervisor.md)** — how the vector is delivered.
