# @brika/grants

> Internal package. It is bundled into `@brika/sdk` and is not published to npm or installable on its own. The grant API is re-exported through the `@brika/sdk/grants` subpath; the examples below are an internal reference.

Typed grant registry, the single primitive every plugin uses to talk to the hub.

A **grant** is a capability a plugin requests in its manifest and the hub awards (or refuses) at install/runtime. Grants are the trust boundary between plugin code and the host: file-system access, secret reads, network calls, IPC channels — all gated by a grant.

## Concepts

- **Grant spec** — declared with `defineGrant({ id, schema, audit, ... })`. Type-safe payloads via Zod schemas.
- **GrantRegistry** — runtime container, resolves a manifest's `grants:` block into runnable handlers.
- **GrantHandler** — server-side implementation invoked when a plugin calls a granted action.
- **AuditLogger** — every grant call can be audited; the registry forwards entries to a pluggable sink.
- **GrantRedaction** — fields removed from audit payloads (secrets, tokens).
- **PermissionGate** — optional consent layer (UI prompt) before a handler runs.

## Usage

```ts
import { defineGrant, GrantRegistry } from '@brika/grants';
import { z } from 'zod';

const readFile = defineGrant({
  id: 'fs.read',
  input: z.object({ path: z.string() }),
  output: z.object({ bytes: z.instanceof(Uint8Array) }),
});

const registry = new GrantRegistry({
  audit: console.log,
});

registry.register(readFile, async (ctx, { path }) => {
  return { bytes: await Bun.file(path).bytes() };
});
```

## Architecture

See the dedicated docs for the design rationale:

- [Grants architecture](https://docs.brika.dev/architecture/authentication) — how grants compose with auth and the request envelope.
- [Sandbox roadmap](https://docs.brika.dev/architecture/sandbox-roadmap) — how the grant primitive feeds the tiered isolation plan.

## Related

- [`@brika/permissions`](../permissions) — coarse-grained permission strings (e.g. `network`, `secrets`) that gate grant requests at install time.
- [`@brika/auth`](../auth) — issues the request envelopes that grants inspect.
- [`@brika/ipc`](../ipc) — the wire format grants travel over.
