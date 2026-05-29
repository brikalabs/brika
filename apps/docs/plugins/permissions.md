# Permissions

A plugin declares the host capabilities it needs in `package.json`. The hub enforces these at the IPC boundary — without a permission, the matching SDK calls throw `PermissionDeniedError` at runtime.

```json
"permissions": ["net", "fs.read", "secrets", "location"]
```

The user can review the list before installing and approve or deny each capability. Granted permissions persist in the hub's state store.

## Permission reference

| Permission | What it allows | SDK surface |
|---|---|---|
| `net` | Outbound HTTP via `fetch`, `Bun.dns.lookup` | `fetch`, OAuth |
| `ws` | Outbound `WebSocket` | `new WebSocket(...)` |
| `fs.read` | Read from filesystem paths the user grants | `import 'node:fs'`, `Bun.file` |
| `fs.write` | Write to filesystem paths the user grants | `import 'node:fs'`, `Bun.write` |
| `secrets` | OS keychain access for this plugin's namespace | `getSecret` / `setSecret` / `deleteSecret` |
| `location` | Read the hub's configured location | `getDeviceLocation` |
| `routes` | Register HTTP routes | `defineRoute`, `defineOAuth` |
| `actions` | Define typed RPCs callable from the UI | `defineAction` |

The full set is intentionally small. If you find yourself reaching for something the grant model doesn't cover, that's a discussion worth having on the issue tracker.

## How enforcement works

Brika rewrites the standard ambient APIs inside plugin processes so calls flow through the [grant dispatch system](../architecture/permissions-grants.md). When your plugin calls `fetch(url)`:

1. The prelude has replaced the global `fetch` with a grant-aware proxy.
2. The proxy looks up the `net` grant in the plugin's permission vector (a compact bitset).
3. If granted, the request goes through; if not, it throws `PermissionDeniedError`.

Same pattern for `Bun.file`, `new WebSocket`, and the rest. The standard import (`fetch`, `'node:fs/promises'`) is the one and only entry point — there is no second blessed API for grant-aware code.

Inside the hub the grant dispatcher records every call (with redaction for sensitive args/results) so the user can audit what plugins are doing.

## Filesystem scope

`fs.read` and `fs.write` are about *whether* the plugin can use the fs API at all. *Where* the plugin can read or write is a separate, narrower contract: the user chooses paths in the UI and the hub builds a scope. Calls that escape the scope (path traversal, symlinks pointing out) are rejected at the grant boundary.

The plugin's own `data/` directory (under `.brika/plugins/<uid>/data/`) is always accessible — no grant needed. Use the [Storage API](storage.md) for it.

## Network scope

`net` is currently all-or-nothing. There is no per-host allowlist. If you need a plugin to call only one provider, that's a policy decision for the user — they decide whether to install based on the manifest.

## What happens without a permission

Calling a denied API throws `PermissionDeniedError` (a `BrikaError` with code `PERMISSION_DENIED`). It is **not** silently dropped. The error surfaces in the log stream and bubbles out of the call:

```ts
try {
  await getSecret('api-token');
} catch (e) {
  if (e.code === 'PERMISSION_DENIED') {
    log.error('Plugin needs the secrets permission');
  }
}
```

This makes it easy to detect missing permissions during development — typo a permission name in the manifest, run the plugin, see the failure.

## Permission changes don't require a restart

When the user toggles a permission in the UI, the hub updates the plugin's permission vector via IPC. The change takes effect on the next API call — no plugin restart required. See [Permissions & Grants](../architecture/permissions-grants.md) for the vector model.

## See also

* **[Manifest Reference](manifest.md)** — the `permissions` array.
* **[Architecture — Permissions & Grants](../architecture/permissions-grants.md)** — dispatch internals, bitset representation, audit redaction.
* **[Secret Store](../architecture/secret-store.md)** — backend for the `secrets` grant.
