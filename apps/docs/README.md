# Introduction

Welcome to the BRIKA Developer Documentation.

BRIKA is a Bun-first home automation runtime with reactive block-based visual workflows. Build powerful automations using type-safe plugins and a visual editor.

## Key Features

* **Reactive Blocks** — Type-safe workflow blocks with Zod schemas and reactive streams
* **Isolated Plugins** — Each plugin runs in a separate process with binary IPC
* **Visual Editor** — Block-based automation builder with React Flow
* **Event-driven** — Pub/sub event bus with glob pattern matching

## Platform Overview

The BRIKA platform consists of several components:

| Component | Description |
|-----------|-------------|
| **Hub** | The Bun runtime that manages plugins, workflows, and the API |
| **UI** | React-based visual workflow editor and dashboard |
| **SDK** | Plugin development kit for building reactive blocks |
| **Plugins** | Isolated processes that provide blocks for workflows |

## Quick Start

```bash
# Clone and install
git clone https://github.com/maxscharwath/brika.git
cd brika
bun install

# Start development
bun run dev
```

* **UI**: http://localhost:5173
* **API**: http://localhost:3001/api/health

## Docker

Run BRIKA with Docker:

```bash
docker run -d \
  --name brika \
  -p 3001:3001 \
  -v ./config:/app/.brika \
  maxscharwath/brika:latest
```

The UI and API are available at http://localhost:3001

## What's Next

* [Getting Started](basics/getting-started.md) — Set up your development environment
* [Create Your First Plugin](plugins/create-plugin.md) — Build a reactive block
* [SDK Reference](api-reference/sdk.md) — Explore the full API

## Repository

* [GitHub](https://github.com/maxscharwath/brika)
* [Docker Hub](https://hub.docker.com/r/maxscharwath/brika)

## Tech Stack

| Layer    | Stack                              |
|----------|------------------------------------|
| Runtime  | Bun, TypeScript, Zod               |
| Frontend | React, Vite, TanStack, React Flow  |
| UI       | shadcn/ui, Tailwind CSS v4         |
