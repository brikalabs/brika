# @brika/permissions

Plugin permission definitions and validation for Brika. **Zero dependencies.**

The hub uses this package to:

1. Validate the `permissions` array declared in each plugin's `package.json`.
2. Render permission consent screens in the UI (each permission has a human-readable label + risk note in the metadata registry).
3. Gate runtime APIs — IPC handlers refuse calls from plugins that didn't declare the matching permission.

## Usage

```ts
import {
  isKnownPermission,
  permissionMetadata,
  validatePermissions,
} from '@brika/permissions';

const result = validatePermissions(manifest.permissions);
if (!result.ok) {
  throw new Error(`Bad manifest: ${result.errors.join(', ')}`);
}

for (const id of result.permissions) {
  const meta = permissionMetadata[id];
  console.log(meta.label, meta.risk);   // "Read filesystem", "high"
}
```

## Permissions covered

The current list — `fs:read`, `fs:write`, `net:*`, `process:spawn`, `keychain:*`, `device:*`, etc. — and their metadata lives in `src/metadata.ts`. Adding a new one requires both a metadata entry and (usually) a hub-side enforcement point.

## Relationship to `@brika/grants`

`@brika/permissions` is the **coarse declaration layer** (what a plugin asks for in its manifest, what the user sees on the consent screen). [`@brika/grants`](../grants/) is the **runtime capability layer** (the typed handler the plugin actually invokes). A plugin must hold the matching permission before the hub will resolve a grant for it.

## Related

- [`@brika/grants`](../grants/) — runtime capabilities gated by these permissions.
- [Authentication & authorization](https://docs.brika.dev/architecture/authentication) — how the two layers compose.
