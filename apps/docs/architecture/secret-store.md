# Secret Store

The hub stores per-plugin secrets (OAuth tokens, API keys, session cookies) in one of two backends: the OS keychain (default on desktops) or an AES-256-GCM encrypted file (default in containers). The two are interchangeable from the SDK's point of view — `getSecret` / `setSecret` work identically.

Selection: `BRIKA_SECRETS_BACKEND=auto|keychain|file`.

## Backends

### Keychain

* macOS — Keychain Services.
* Linux — Secret Service (`libsecret`).
* Windows — Credential Manager.

The hub uses `Bun.secrets` to talk to all three. Each secret is keyed `<plugin-uid>.<key>` so two plugins cannot read each other's secrets even with the key name.

Keychain access requires a graphical session or a manually-unlocked keyring. Headless / container environments typically don't have one, which is why the file backend exists.

### File

* Path: `${BRIKA_HOME}/secrets.enc`.
* Encryption: AES-256-GCM.
* Key derivation: HMAC-SHA-256 from the hub's machine ID and a per-install salt.
* Storage: one encrypted JSON blob containing every secret.

The file is created the first time a secret is written. The hub takes a process-wide lock during writes; concurrent reads are fine.

### Auto

The default. Tries the keychain on first use; on `ERR_SECRETS_PLATFORM_ERROR` (no keyring / no session / unlocked), falls back to the file backend for the rest of the process lifetime. The choice is logged once.

## SDK surface

Plugins call:

```ts
import { getSecret, setSecret, deleteSecret } from '@brika/sdk';

await setSecret('api-token', token);
const value = await getSecret('api-token');  // string | null
await deleteSecret('api-token');             // boolean (true if deleted)
```

All three require the `"secrets"` permission. The hub identifies the calling plugin from the IPC channel — a plugin can't read another plugin's secrets even if it knows the namespaced key.

## `secret: true` preferences

A preference declared with `"secret": true` (or a config field typed `z.secret()`) is stored the same way as a programmatic secret. When the user sets the value through the UI, the hub:

1. Writes the actual value via the SecretStore.
2. Writes a `__secret_<name>: null` sentinel into `brika.yml` so a diff still shows the field was set.
3. Re-pushes the resolved value to the plugin via IPC.

The plugin reads the value through `getPreferences()` normally — the SDK resolves `__secret_*` sentinels back to their real values transparently.

## Key namespace

Secret keys must match `^[a-zA-Z][a-zA-Z0-9_.-]*$` (1–128 chars). Convention: dot-separated namespaces (`oauth.spotify.token`, `api.access-token`).

## Rotation

There is no built-in rotation. To rotate:

```ts
await setSecret('api-token', newToken);
```

…overwrites the old value. Empty strings delete (`setSecret(k, '')` ≡ `deleteSecret(k)`).

## Backing up

The keychain entries are part of the OS-level backup story (Time Machine, Vorta, system imaging). The file backend keeps the encrypted blob inside `.brika/secrets.enc` — backing up `.brika/` covers it.

To migrate between backends, copy the secrets at the SDK level — there is no built-in importer.

## Why per-process backend choice?

The decision happens once per hub process. Switching at runtime would mean stale references on the plugin side. The user can force a backend via `BRIKA_SECRETS_BACKEND`; otherwise auto-detection is sticky for the process lifetime.

## See also

* **[Secrets](../plugins/secrets.md)** — author-facing.
* **[Permissions & Grants](permissions-grants.md)** — the `secrets` grant.
* **[OAuth](../plugins/oauth.md)** — uses `setSecret` internally.
