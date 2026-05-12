# @brika/plugin

Core plugin runtime types shared by the Brika hub and the plugin SDK. **Zero dependencies** — pure TypeScript types and a small `arePortTypesCompatible()` helper.

If you're writing a plugin, you almost certainly want [`@brika/sdk`](../sdk/) instead; this package is the type layer underneath it.

## What's in here

- `Plugin` — the lifecycle interface (`activate` / `deactivate`)
- `PluginHealth` — periodic-status reporting types
- Manifest schemas — typed views of the `brika` field in a plugin's `package.json`
- Preference schemas — the typed configuration surface declared by plugins
- `arePortTypesCompatible(a, b)` — workflow port compatibility check

## Why a separate package?

The hub needs these types to validate manifests, type the IPC contract, and reason about port compatibility. The plugin SDK needs them to describe what a plugin exports. Putting them in their own zero-dep package keeps both consumers free of incidental coupling.
