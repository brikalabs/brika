# Getting Started

Brika is a self-hosted automation hub. You install it once, point it at the integrations you care about (smart-home devices, web APIs, your own services), and then build reactive workflows and live dashboards that wire those integrations together.

This page walks you through the three things you need to be productive: installing the hub, starting it, and getting a feel for what each piece of the UI does. If you already have a Brika installation, skip to [Core Concepts](concepts.md).

## 1. Install Brika

The fastest way is the installer. It downloads a single statically-linked binary into `~/.brika/bin/` (or `%LOCALAPPDATA%\brika\bin\` on Windows) and bundles Bun, so you do not need Node.js or Bun installed separately.

```sh
# macOS / Linux
curl -fsSL https://brika.dev/install.sh | bash

# Windows (PowerShell)
iwr -useb https://brika.dev/install.ps1 | iex
```

If you would rather run Brika in Docker, pull the image directly:

```sh
docker run -d --pull=always -p 3001:3001 \
  -v ./config:/app/.brika \
  --name brika ghcr.io/brikalabs/brika
```

[Installation](installation.md) covers every option (package managers, building from source, signed releases, version pinning).

## 2. Start the hub

```sh
brika start --open
```

This starts the hub in the background and opens the web UI in your default browser. The hub listens on `127.0.0.1:3001` by default. The first time you start Brika in a directory it creates a `.brika/` folder containing your configuration, installed plugins, log files, and persistent state — see [The .brika Directory](data-directory.md).

To stop the hub:

```sh
brika stop
```

To check whether it is running:

```sh
brika status
```

Behind the scenes `brika start` claims a PID lockfile (`.brika/brika.pid`). Trying to start a second hub in the same directory is rejected with a clear error — see [Plugin Supervisor](../architecture/plugin-supervisor.md) for the full lifecycle.

## 3. Tour the UI

When the UI loads the first time it walks you through a setup flow (create an admin user, pick a timezone and approximate location). After that the sidebar shows you everything Brika can do:

| Section | What lives there |
|---|---|
| **Dashboard** | Overview: hub health, running plugins, recent activity |
| **Boards** | Drag-and-drop grids of *bricks* — your live dashboard |
| **Workflows** | Visual editor for reactive workflows built from *blocks* |
| **Plugins** | Installed plugins, plus the registry for installing more |
| **Sparks** | Typed event bus — emit and subscribe to events across plugins |
| **Logs** | Live log stream, filterable by plugin, level, and source |
| **Settings** | Auth users, themes, location, remote access |

## 4. Install your first plugin

The hub ships with built-in blocks (condition, delay, log, …) but most useful integrations live in plugins published to the registry. Open the **Plugins → Registry** tab in the UI and install one — for example `@brika/plugin-timer`.

Then open **Workflows**, drag a `timer` block onto the canvas, give it an interval of 5 seconds, connect its output to a `log` block, and click *Enable*. Watch the **Logs** page to see the timer fire.

Plugins can also contribute **bricks** — dashboard cards. Open **Boards**, create a board, click *Add brick*, and pick one from a plugin that contributes them (the `weather` plugin is a good first taste).

## What to read next

* **[Core Concepts](concepts.md)** — the vocabulary you will see everywhere: blocks vs bricks, workflows vs boards, sparks, actions, pages.
* **[The .brika Directory](data-directory.md)** — what is in `.brika/`, what is safe to back up, what regenerates.
* **[Build Your First Plugin](../tutorials/first-plugin.md)** — end-to-end tutorial to scaffold, write, and install a real plugin.
* **[Architecture Overview](../architecture/overview.md)** — if you want to understand how the hub actually works under the hood.
