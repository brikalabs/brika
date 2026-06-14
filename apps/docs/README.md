# Brika

**Build. Run. Integrate. Keep Automating.**

Brika is a self-hosted automation hub that runs on your own hardware. It is a single binary that ships with a Bun runtime, supervises plugin processes, serves a React-based dashboard, and gives you a visual editor for wiring sensors, services, and actions into reactive workflows.

This documentation covers everything from installing Brika on a Raspberry Pi to writing custom plugins, understanding the binary IPC protocol that links the hub to its child processes, and consuming the REST/SSE API from external tools.

## What you can build

* **Smart-home automation** — schedule lights, react to motion sensors, glue together Matter, Zigbee, and HTTP-only devices.
* **Live dashboards** — pin React-rendered cards (we call them *bricks*) to boards that update in real time as data arrives from your plugins.
* **Personal integrations** — call Spotify, fetch weather, scrape a page on a cron, post to Slack — all in type-safe TypeScript plugins.
* **Anything reactive** — every workflow node is a typed stream; pipe, debounce, throttle, switch, combine.

## The 60-second tour

```sh
curl -fsSL https://brika.dev/install.sh | bash
brika start --open
```

You now have a hub listening on `127.0.0.1:3001` with a web UI in your browser. Open **Plugins → Registry** and install `@brika/plugin-weather`.

Then open the **Workflows** page, drag the `weather.current` block onto the canvas, connect its `temperature` output to a `condition` block, and wire the *true* branch into a `notify` action. Save. Done — the workflow runs whenever the weather block emits.

Want to see live data? Open the **Boards** page, create a board, drop a `weather.current` brick onto the grid. The brick is a React component running in your browser, fed by the weather plugin process over a shared SSE channel.

## Two primitives

Every plugin contributes some combination of these:

| Primitive | Where it runs | What it does |
|---|---|---|
| **Block** | Plugin process (Bun) | A typed node in a reactive workflow — inputs, outputs, config, side effects |
| **Brick** | Your browser (React) | A dashboard component fed live data from the plugin process |
| **Action** | Plugin process | An RPC the UI can call — read-only fetch or mutation |
| **Spark** | Anywhere | A typed event published to a global bus |
| **Page** | Your browser (React) | A full-screen UI route the plugin owns |

Together they cover triggers, transforms, side effects, dashboards, and admin UIs. The [Core Concepts](basics/concepts.md) page maps each one to the underlying machinery.

## How the documentation is organised

* **[Basics](basics/getting-started.md)** — install Brika, start the hub, learn the vocabulary.
* **[CLI & TUI](cli/overview.md)** — every `brika` command, every TUI screen, every environment variable.
* **[Tutorials](tutorials/first-plugin.md)** — build a real plugin from `bun create brika` to a running brick on a board.
* **[Plugin Development](plugins/overview.md)** — the `@brika/sdk` reference: blocks, bricks, lifecycle, sparks, stores, schema types.
* **[Architecture](architecture/overview.md)** — how the hub, the compiler, the IPC channel, the reactive engine, and the brick host actually work. Read this if you are contributing.
* **[HTTP API](api/overview.md)** — every REST endpoint and SSE stream exposed by the hub.
* **[Contributing](contributing/development.md)** — develop, test, and release Brika itself.

## Project layout

Brika lives in a single monorepo under [github.com/brikalabs/brika](https://github.com/brikalabs/brika):

```
apps/
  hub/         Bun server — REST/SSE API, plugin supervisor, workflow runtime
  ui/          React frontend — TanStack Router, brick rendering host
  console/     The `brika` CLI + Brix-based TUI dashboard
  build/       Binary build orchestration (Bun.build → compile)
  signaling/   Cloudflare Worker for remote access (peer brokering)
  docs/        These docs (GitBook)
packages/
  sdk/         The @brika/sdk plugin authors consume
  compiler/    Build-time transforms (externals rewrite, action IDs, Tailwind)
  flow/        Reactive stream engine
  ipc/         Binary IPC protocol
  schema/      Zod → JSON Schema
  …            See contributing/repo-structure.md for the full list
plugins/
  builtin/   Core blocks: condition, delay, log, …
  timer/ weather/ matter/ spotify/ …  First-party plugins
```

## Links

* **Source** — [github.com/brikalabs/brika](https://github.com/brikalabs/brika)
* **Docker image** — `ghcr.io/brikalabs/brika`
* **Registry** — install plugins from the **Plugins → Registry** tab in the web UI or TUI
* **License** — [MIT](https://github.com/brikalabs/brika/blob/main/LICENSE)
