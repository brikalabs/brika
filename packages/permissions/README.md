# @brika/permissions

Plugin permission definitions and validation for Brika. **Zero dependencies.**

The hub uses this package to:

1. Validate the `permissions` array declared in each plugin's `package.json`.
2. Render permission consent screens in the UI (each permission has a human-readable label + risk note in the metadata registry).
3. Gate runtime APIs — IPC handlers refuse calls from plugins that didn't declare the matching permission.

## Usage

```ts
import {
  PERMISSIONS,
  filterValidPermissions,
  isValidPermission,
} from '@brika/permissions';

// Keep only the declared permissions the registry recognizes.
const granted = filterValidPermissions(manifest.permissions);

for (const id of granted) {
  if (!isValidPermission(id)) continue;
  const meta = PERMISSIONS[id];
  console.log(meta.labelKey, meta.icon); // i18n key + lucide icon for the consent UI
}
```

## Permissions covered

The permission families (`location`, `secrets`, `net`, `netLocal`, `rawSocket`, `fs`, `ws`, `dns`, `ui`) and their display metadata live in `src/registry.ts` (assembled into the exported `PERMISSIONS` map by `src/index.ts`). Adding a new one requires both a metadata entry and (usually) a hub-side enforcement point.

## Relationship to `@brika/grants`

`@brika/permissions` is the **coarse declaration layer** (what a plugin asks for in its manifest, what the user sees on the consent screen). [`@brika/grants`](../grants/) is the **runtime capability layer** (the typed handler the plugin actually invokes). A plugin must hold the matching permission before the hub will resolve a grant for it.

## Related

- [`@brika/grants`](../grants/) — runtime capabilities gated by these permissions.
- [Authentication & authorization](https://docs.brika.dev/architecture/authentication) — how the two layers compose.
