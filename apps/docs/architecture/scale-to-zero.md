# Scale to zero

Every enabled plugin runs as its own `Bun.spawn` child process (see [Plugin Supervisor](./plugin-supervisor.md)). That isolation is the security boundary, but a resident process per plugin costs RAM whether or not the plugin is doing anything: a hub with hundreds of installed plugins would pay for all of them at once.

Scale to zero reaps **idle** plugin processes and respawns them on demand, so the hub pays only for plugins that are actually working. It is **off by default** and changes nothing until an operator sets a positive idle window.

Key files:

* `apps/hub/src/runtime/plugins/plugin-reaper.ts`: the idle-reap policy (pure scheduling, unit-tested with a fake clock).
* `apps/hub/src/runtime/plugins/plugin-lifecycle.ts`: `ensureStarted` (lazy respawn), `#reap` / `#reapInner`, reap guards.
* `apps/hub/src/runtime/plugins/plugin-process.ts`: per-plugin activity / in-flight / owned-instance tracking.
* `apps/hub/src/runtime/workflows/workflow-executor.ts`: reap guards, host-scheduled triggers, respawn-on-dispatch.
* `apps/hub/src/runtime/workflows/trigger-registry.ts`: the hub-side trigger scheduler.

## Configuration

Set under `hub.plugins` in `brika.yml` (env overrides in parentheses):

* `idleReapMs` (`BRIKA_PLUGIN_IDLE_REAP_MS`): reap a plugin after this many milliseconds with no activity. `0` (default) disables reaping entirely.
* `keepWarmCount` (`BRIKA_PLUGIN_KEEP_WARM_COUNT`): keep the N most-recently-active reapable plugins resident regardless of idleness, to hide cold-start latency on the hot set.
* `bytecode` (`BRIKA_PLUGIN_BYTECODE`): compile plugin server bundles to JSC bytecode so cold starts skip parse/compile.

## The reaper

A periodic sweep reaps every plugin that passes **all** of these gates:

* its idle window has elapsed (no work or output for `idleReapMs`);
* it has no in-flight request/response call (a route/action/tool awaiting a reply is never killed mid-call, independent of the idle window);
* no reap guard pins it (see below);
* it is not among the `keepWarmCount` most-recently-active plugins.

"Activity" is real work: block input, a route/action/tool call, a stream op, or the plugin producing output. Heartbeats and metric samples deliberately do **not** count, or a plugin would never look idle.

Reaping is **not** disabling. A reaped plugin stays enabled and its blocks stay registered (so the editor palette and routing survive); only the OS process is stopped. The crash-restart budget is untouched (reaping is intentional, not a crash).

## Lazy respawn

A reaped plugin is respawned on demand by `PluginLifecycle.ensureStarted`, which re-spawns and waits for readiness (the same path as enabling). Every entry point that reaches a plugin goes through it: workflow `startBlock`, HTTP routes, OAuth, action calls, and tool invocations. A disabled plugin is never respawned: reaping only revives plugins the operator left enabled.

## What stays resident (reap guards)

Some plugins must not be reaped while in use. Guards pin them:

* **Plugins with a passive UI surface** (board bricks or pages): they render live and push data, with no inbound request to respawn them on.
* **Plugins providing an in-plugin source block**: a workflow run-root that runs its own timer/subscription inside the plugin (e.g. `start(interval(...))`, `start(subscribeSpark(...))`). Killing it would stop the source firing.

Everything else reaps when idle: headless plugins not used by any running workflow, plugins reached only through request/response surfaces (routes/actions/tools), host-scheduled triggers, and downstream action/transform blocks.

## Host-scheduled triggers

A block can declare a `trigger` descriptor (see [Reactive Blocks](../plugins/reactive-blocks.md#host-scheduled-triggers-scale-to-zero)) so the **hub** owns the schedule and fires the block's output. The providing plugin needs no resident process: the `TriggerRegistry` runs the timer hub-side and, on each fire, emits through the normal run path. A trigger-only plugin is reaped while the hub keeps firing its trigger.

The descriptor is a discriminated union on `kind` (only `interval` today), optional and forward-compatible: a future `kind` an older hub doesn't recognise degrades to a normal block (the block's in-plugin `run()` fallback) rather than failing to register.

## Downstream lazy-reap

When a hosted trigger fires and dispatches to a downstream block whose plugin has been reaped, delivery is self-healing. `pushBlockInput` reports whether a resident process owned the instance; if none does, the executor re-creates the block instance (`startBlock`, which respawns the plugin) and retries. Deliveries to one instance are serialized so a burst respawns the plugin at most once and stays in order; the queued events act as a front-door buffer that holds work while the plugin boots.

The effect: an action plugin behind an infrequent trigger (say a five-minute cron) is reaped for almost the entire interval and respawns only to handle each fire.

## State across a reap

A reaped plugin loses in-memory state; on respawn its blocks are re-created fresh and `onInit` runs again. State that must survive a reap should be persisted with the storage API (`getDataDir` / `readJSON` / `writeJSON` / `defineStore`), which writes to the plugin's `/data` directory: reaping never touches it, so persisted state is intact on respawn. Downstream blocks in particular must not rely on in-memory state surviving an idle period.

## Security

Scale to zero does not weaken isolation: a respawned plugin is a fresh sandboxed subprocess, exactly as before. Plugins are never co-located in a shared process to save memory; the savings come from not running idle plugins at all.
