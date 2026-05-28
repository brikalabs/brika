# @brika/plugin

Core plugin runtime types shared by the Brika hub and the plugin SDK. **Zero dependencies** — pure TypeScript types and a small `arePortTypesCompatible()` helper.

If you're writing a plugin, you almost certainly want [`@brika/sdk`](../sdk/) instead; this package is the type layer underneath it.

## What's in here

- `Plugin` — the lifecycle interface (`activate` / `deactivate`)
- `PluginHealth` — periodic-status reporting types
- Manifest schemas — typed views of the `brika` field in a plugin's `package.json`
- Preference schemas — the typed configuration surface declared by plugins
- `arePortTypesCompatible(a, b)` — workflow port compatibility check

## Quick reference

```ts
import type { Plugin } from '@brika/plugin';

// What the hub sees when it loads a plugin process:
const plugin: Plugin = {
  async activate(ctx) {
    ctx.log.info('hello');
  },
  async deactivate() {
    // optional cleanup
  },
};
```

The hub validates the manifest against this package's schemas before spawning the plugin process; the SDK uses the same types so authors get the same shape they're going to be type-checked against at install time.

## Why a separate package?

The hub needs these types to validate manifests, type the IPC contract, and reason about port compatibility. The plugin SDK needs them to describe what a plugin exports. Putting them in their own zero-dep package keeps both consumers free of incidental coupling — and lets `@brika/sdk` stay lean for plugin bundlers that don't want to pull in hub-side machinery.

## Related

- [`@brika/sdk`](../sdk/) — the plugin author surface built on top of this.
- [`@brika/ipc`](../ipc/) — the wire format `Plugin` callbacks talk over.
- [`@brika/type-system`](../type-system/) — port type definitions referenced by `arePortTypesCompatible`.
