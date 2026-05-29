# Secrets

The secrets API stores per-plugin credentials in the OS keychain (or an encrypted file fallback inside Docker). Use it for OAuth tokens, API keys, session cookies — anything you don't want sitting in plaintext on disk.

```ts
import { getSecret, setSecret, deleteSecret } from '@brika/sdk';

await setSecret('session-token', token);
const stored = await getSecret('session-token');
await deleteSecret('session-token');
```

All three calls require the `"secrets"` permission in `package.json`:

```json
"permissions": ["secrets"]
```

Without it, every call throws `PermissionDeniedError`.

## How it's stored

Each secret is keyed `<plugin-uid>.<key>` in the OS keychain. The hub identifies the calling plugin from the IPC channel itself — a plugin cannot read another plugin's secrets, even if it knows the key name.

The backend is selectable:

* **`keychain` (default on desktops)** — macOS Keychain Services, Linux Secret Service, Windows Credential Manager via `Bun.secrets`.
* **`file` (default in containers)** — AES-256-GCM encrypted JSON at `${BRIKA_HOME}/secrets.enc`. The master key derives from the hub's machine ID.
* **`auto`** — try keychain; fall back to file on platform errors.

Set with `BRIKA_SECRETS_BACKEND=keychain|file|auto`. See [Secret Store](../architecture/secret-store.md) for the full backend story.

## Key naming

Secret keys must match `^[a-zA-Z][a-zA-Z0-9_.-]*$` (1–128 chars). Convention is dot-separated namespaces:

```
api.access-token
api.refresh-token
session.cookie
```

## Secrets vs `secret: true` preferences

Two ways to handle sensitive values:

| Approach | When to use |
|---|---|
| **`secret: true` preference** | The user pastes a value into the plugin's settings UI |
| **`setSecret` API** | The plugin obtains a value programmatically (OAuth callback, login flow) |

Both end up in the same backend; the user-facing flow is the difference.

## Empty strings delete

`setSecret(key, '')` deletes the secret. Use `deleteSecret(key)` for clarity.

## Concurrent calls

The backend serialises writes per key. Concurrent reads are fine. There is no explicit locking — if you do read-modify-write, do it carefully or use a different pattern.

## See also

* **[Preferences](preferences.md)** — `secret: true` field type.
* **[Secret Store](../architecture/secret-store.md)** — backend internals.
* **[Permissions](permissions.md)** — the `"secrets"` grant.
* **[OAuth](oauth.md)** — uses `setSecret` internally for token storage.
