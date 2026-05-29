# First Run

This page walks you through starting Brika for the first time, completing the setup flow, and orienting yourself in the UI.

## Start the hub

From any directory where you want Brika's data to live:

```sh
brika start --open
```

* `brika start` boots the hub in the **background** (detached) and writes its PID to `.brika/brika.pid`.
* `--open` launches the web UI in your default browser after the hub is ready.

Use `-a` / `--attach` to keep the hub attached to your terminal — useful for `tail -f` style debugging.

```sh
brika start -p 8080            # listen on a custom port
brika start --host 0.0.0.0     # listen on every interface (LAN, Docker)
brika start --attach           # don't detach (same as `brika hub`)
```

By default the hub listens on `127.0.0.1:3001`. The host allowlist middleware actively rejects HTTP requests whose `Host` header is not loopback or the configured bind address, as a defense against DNS rebinding attacks. To expose the hub on your LAN you must bind to a non-loopback address explicitly (`--host 0.0.0.0` plus a firewall rule). See [Authentication](../architecture/auth.md).

## Check status

```sh
brika status
```

Reports whether a hub is currently running in this workspace, its PID, the URL it is serving, and the version.

## Stop the hub

```sh
brika stop          # graceful stop — sends SIGTERM, clears the PID file
```

There is no dedicated `restart` command — chain `brika stop && brika start` (or use the TUI's restart action) when you need to recycle the hub.

## The setup flow

The first time the UI loads it walks you through:

1. **Create the admin user.** Pick a username and password. This account has the `ADMIN_ALL` scope and can manage every resource.
2. **Pick a location.** Brika asks for a rough lat/long so location-aware plugins (weather, sunrise/sunset, presence) work without each one re-prompting. Plugins receive the location via the `location` grant — see [Location API](../plugins/location.md).
3. **Choose a timezone.** Cron schedules and date formatting use this.
4. **Optional remote access.** Skip if you only want LAN access. Choose to claim a name on the coordinator and you get a `https://hub.brika.dev/<your-name>` URL that proxies to your hub over WebRTC — see [Remote Access](../architecture/remote-access.md).

The setup data lands in `.brika/state/` (location, timezone) and the OS keychain (admin credentials, remote-access token).

## A tour of the UI

The sidebar has six top-level sections.

### Dashboard

The landing page. Shows hub health, plugin process statuses, recent log lines, recent spark activity, and update banners.

### Boards

Boards are responsive grids you fill with **bricks**. Each brick is a React component rendered in your browser, fed live data from a plugin process over the [shared SSE channel](../architecture/sse-pool.md). Drag the corners to resize; bricks declare which sizes they support (`families`).

Multiple boards let you have separate views — one for an iPad on the wall, one for your desktop, one for a TV.

### Workflows

The drag-and-drop **block editor**. A workflow is a graph of blocks; each block is a reactive node provided by a plugin. Wire outputs to inputs, configure each block, and click *Enable* to start the workflow.

The runtime evaluates the graph as a reactive stream. Triggers (clock, motion, webhook) push values into downstream blocks; transforms (map, filter, debounce) process the stream; actions (HTTP call, notification, device toggle) consume it. See [Reactive Blocks](../plugins/reactive-blocks.md) and [Reactive Streams](../plugins/reactive-streams.md).

### Plugins

Two tabs: **Installed** and **Registry**.

* *Installed* lists plugins on this hub, with health badges (running, crashed, awaiting-config), per-plugin permissions, configuration, and a *Reload* button.
* *Registry* browses the curated plugin index. Click a plugin to see its README, capabilities, and required permissions, then click *Install*.

### Sparks

Sparks are a typed event bus. Any plugin can publish events; any block can subscribe to them. The Sparks page lists every defined spark type, recent emissions, and lets you inspect the event payload schema. Use sparks when "one block emits, many things react" feels more natural than wiring connectors. See [Sparks](../plugins/sparks.md).

### Logs

Live tail of every log line emitted by the hub and its plugins. Filter by level, source, or plugin; search by free text. Logs persist to a [ring buffer](../architecture/logs.md) on disk (default retention: 7 days).

### Settings

* **Users** — create, edit, delete user accounts. Assign scopes.
* **Themes** — pick a theme or import a custom one.
* **Location & timezone** — what setup asked for; editable.
* **Remote access** — claim/release a hub name, copy the public URL.
* **Update channel** — stable or canary.

## Where things live

| Concern | Location |
|---|---|
| Hub config | `.brika/brika.yml` |
| Installed plugins | `.brika/plugins/` |
| Plugin runtime data | `.brika/plugins/<uid>/data/` |
| Database (Drizzle/SQLite) | `.brika/state/` |
| Logs | `.brika/logs/` |
| Secrets | OS keychain (or encrypted file — see [Secret Store](../architecture/secret-store.md)) |
| PID file | `.brika/brika.pid` |
| CLI auth token | `~/.brika/cli-token` (per-user) |

Backing up `.brika/` plus the keychain entries restores a Brika instance entirely.

## See also

* **[Core Concepts](concepts.md)** — what blocks, bricks, sparks, actions actually are.
* **[CLI Commands](../cli/commands.md)** — every subcommand and flag in detail.
* **[Configuration File](../cli/configuration.md)** — the `brika.yml` schema.
