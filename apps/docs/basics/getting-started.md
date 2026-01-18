# Getting Started

This guide will help you set up BRIKA for local development.

## Prerequisites

* [Bun](https://bun.sh/) 1.0 or later
* [Node.js](https://nodejs.org/) 18+ (for some tooling)
* Git

## Installation

### Clone the Repository

```bash
git clone https://github.com/maxscharwath/brika.git
cd brika
```

### Install Dependencies

```bash
bun install
```

This installs all dependencies for the monorepo, including apps, packages, and plugins.

### Start Development

```bash
bun run dev
```

This starts both the Hub (API server) and UI (frontend) in development mode:

* **UI**: http://localhost:5173
* **API**: http://localhost:3001

### Run Individual Apps

```bash
# Hub only
bun run dev:hub

# UI only
bun run dev:ui
```

## Docker Setup

For production or quick testing, use Docker:

```bash
docker run -d \
  --name brika \
  -p 3001:3001 \
  -v ./config:/app/.brika \
  maxscharwath/brika:latest
```

### Docker Compose

```yaml
services:
  brika:
    image: maxscharwath/brika:latest
    container_name: brika
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - ./config:/app/.brika
```

```bash
docker compose up -d
```

## Running Tests

```bash
# Run all tests
bun test

# Watch mode
bun test --watch

# Specific directory
bun test apps/hub
```

## Create Your First Plugin

The fastest way to create a new plugin:

```bash
bun create brika my-plugin
```

This interactive CLI scaffolds a complete plugin with TypeScript configuration, block definitions, and i18n support.

## Next Steps

* [Quick Setup](quick-setup.md) — Fast-track checklist
* [Project Structure](project-structure.md) — Understand the codebase
* [Create a Plugin](../plugins/create-plugin.md) — Build your first plugin
