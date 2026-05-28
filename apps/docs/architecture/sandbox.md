# Sandbox

Plugin processes can run inside an OS-level sandbox to limit what a malicious or buggy plugin can do beyond the grant model. The sandbox is layered:

* **L1** — process isolation. Every plugin is its own Bun subprocess, no shared memory with the hub.
* **L2** — JS layer. The grant proxy intercepts `fetch`, `Bun.file`, `import 'node:fs/promises'`, etc., and enforces the permission vector.
* **L3** — OS sandbox. The plugin process runs under an OS-level sandbox profile, blocking syscalls beyond the granted scope.

L1 and L2 are always on. L3 is platform-dependent and selectable.

## `BRIKA_SANDBOX_MODE`

The env var picks the L3 mode:

| Value | Behaviour |
|---|---|
| `exec` (macOS) | Spawn the plugin wrapped in `sandbox-exec` with a per-plugin profile |
| `noop` | L1 + L2 only, no OS sandbox |
| `auto` (default) | `exec` on macOS, `noop` elsewhere |

Linux support (seccomp / Landlock) is on the roadmap.

## macOS — sandbox-exec

`sandbox-exec` is the legacy macOS sandbox runner (the same machinery `xpc_services_v2` and Apple's first-party apps use). Brika generates a small per-plugin profile that:

* Defaults to `(deny default)`.
* Allows `mach-lookup` of the syscalls Bun needs.
* Allows file reads under the plugin's own directory plus the granted scopes.
* Allows network calls if the plugin has `net`.
* Disallows everything else.

The profile is regenerated whenever the plugin's permissions change. The hub spawns the plugin via `sandbox-exec -f <profile> bun --bun <main>`.

`sandbox-exec` is deprecated by Apple but still functional and well-supported. The alternative — XPC services or `App Sandbox` — would require packaging plugins as bundles, which doesn't fit Brika's npm-package model. Until Apple removes `sandbox-exec`, it's the right tool.

## What the JS layer can't catch

The JS grant proxy enforces grants on the standard APIs (`fetch`, `Bun.file`, `node:fs`, `node:net`). A plugin that uses `bun:ffi` to call into a native library, or `process.binding(…)` to reach Node internals, can sidestep the JS layer. L3 is the line of defence against that — `sandbox-exec` blocks the syscall regardless of which JS API requested it.

## What L3 still can't prevent

* Anything a JS engine bug allows (typically minor and fixed quickly upstream).
* Anything a permission grants — if you grant `fs.read` over `/Users/you`, a plugin with that grant can read your photos.

The right answer is "grant carefully and review what plugins actually do." The audit log helps — every grant call is logged with redacted args.

## Trade-offs

* **Spawn cost** — sandbox-exec adds a tiny amount of spawn latency. Imperceptible in normal use.
* **Debugging** — when a plugin crashes inside the sandbox, the error context is the same as outside. Bun's IPC channel still works.
* **Native libraries** — anything that mmaps shared libraries from non-standard locations needs an explicit allowance in the profile. Rare in practice.

## Disabling for development

```sh
BRIKA_SANDBOX_MODE=noop brika start --attach
```

Useful when developing a plugin that uses a system feature you haven't yet figured out how to grant. Don't ship hubs in noop mode.

## See also

* **[Permissions & Grants](permissions-grants.md)** — L2 (JS layer).
* **[Plugin Supervisor](plugin-supervisor.md)** — how plugins are spawned.
* **[Environment Variables](../cli/environment.md)** — `BRIKA_SANDBOX_MODE`.
