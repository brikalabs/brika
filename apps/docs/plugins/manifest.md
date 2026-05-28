# Manifest Reference

Every Brika plugin is a standard npm package. The hub reads `package.json` to discover what the plugin contributes. The schema is published at [schema.brika.dev](https://schema.brika.dev) — point your editor at it for autocomplete and validation:

```json
{
  "$schema": "https://schema.brika.dev/plugin.schema.json"
}
```

The schema is generated from the Zod definitions in `@brika/schema/plugin` and validated by the hub on plugin load. If the manifest fails validation, the plugin is marked `incompatible` and no runtime checks run — fix the manifest first.

## Required fields

| Field | Description |
|---|---|
| `name` | npm package name, conventionally `@scope/plugin-foo` |
| `version` | Semver |
| `type` | Must be `"module"` |
| `main` | Entry file — typically `./src/index.tsx` |
| `engines.brika` | Minimum compatible Brika version (semver range) |

## Recommended fields

| Field | Description |
|---|---|
| `displayName` | Pretty name shown in the UI |
| `description` | One-line summary |
| `author` | Name or `{ name, email, url }` |
| `license` | SPDX identifier |
| `homepage` | URL to project home |
| `repository` | `{ type: "git", url, directory }` |
| `icon` | Relative path to an SVG, e.g. `./icon.svg` |
| `keywords` | Include `"brika"` and `"brika-plugin"` for registry discovery |
| `files` | What ships to npm — typically `["src", "locales", "icon.svg", "README.md"]` |

## Capability arrays

These arrays tell the hub what the plugin contributes. Each is optional.

### `blocks`

```json
"blocks": [
  {
    "id": "timer",
    "name": "Timer",
    "description": "Set a one-shot timer that fires after a duration",
    "category": "trigger",
    "icon": "timer",
    "color": "#22c55e"
  }
]
```

| Field | Description |
|---|---|
| `id` | Unique within the plugin. Matches the block's `defineReactiveBlock({ id })` value |
| `name` | Display name in the workflow editor |
| `description` | Hover help |
| `category` | `trigger`, `action`, `flow`, `transform` — drives sidebar grouping |
| `icon` | Name of a `lucide-react` icon |
| `color` | Hex colour used in the editor sidebar and node header |

Block-side details live on the [Reactive Blocks](reactive-blocks.md) page.

### `bricks`

```json
"bricks": [
  {
    "id": "current-weather",
    "name": "Current Weather",
    "description": "Live temperature, humidity, gradient background",
    "category": "weather",
    "icon": "cloud",
    "color": "#3b82f6",
    "families": ["sm", "md", "lg"],
    "config": [
      {
        "type": "text",
        "name": "city",
        "label": "City",
        "default": "Zurich"
      },
      {
        "type": "checkbox",
        "name": "metric",
        "label": "Metric units",
        "default": true
      }
    ]
  }
]
```

| Field | Description |
|---|---|
| `id` | Unique within the plugin. The compiler expects `src/bricks/<id>.tsx` |
| `name`, `description`, `icon`, `color`, `category` | UI metadata |
| `families` | Which grid sizes this brick supports — array of `sm`, `md`, `lg`, `xl`, `2xl` |
| `config` | Per-instance config schema (see below) |

### `pages`

```json
"pages": [
  {
    "id": "devices",
    "name": "Devices",
    "icon": "cpu"
  }
]
```

| Field | Description |
|---|---|
| `id` | Unique within the plugin. The compiler expects `src/pages/<id>.tsx` |
| `name` | Sidebar label |
| `icon` | `lucide-react` icon name |

### `sparks`

```json
"sparks": [
  { "id": "price-update", "name": "Price Update", "description": "Emitted on every fetch" }
]
```

Each declared spark must have a matching `defineSpark({ id })` call in the plugin's code; the hub validates the IDs on load.

### `permissions`

The host capabilities this plugin needs. The hub will deny calls to APIs whose permission is missing.

```json
"permissions": ["net", "fs.read", "secrets", "location", "ws"]
```

| Permission | Allows |
|---|---|
| `net` | Outbound HTTP via `fetch` and `Bun.dns.lookup` |
| `ws` | Outbound `WebSocket` |
| `fs.read` / `fs.write` | Filesystem access through grant-aware shims |
| `secrets` | `getSecret` / `setSecret` / `deleteSecret` against the OS keychain |
| `location` | `getDeviceLocation` |
| `routes` | Register HTTP routes (`defineRoute`) |
| `actions` | Define and serve actions (`defineAction`) |

The set is intentionally small; see [Permissions](permissions.md) for the full model and [Permissions & Grants](../architecture/permissions-grants.md) for the runtime enforcement.

### `preferences`

Top-level plugin config (as opposed to per-block or per-brick config). Lives on the plugin's Settings panel in the UI.

```json
"preferences": [
  {
    "type": "text",
    "name": "apiKey",
    "label": "API key",
    "description": "Your provider's API key",
    "secret": true
  },
  {
    "type": "dynamic-dropdown",
    "name": "defaultDevice",
    "label": "Default device",
    "description": "Loaded at runtime from the plugin"
  }
]
```

`secret: true` marks the field so the hub stores the value in the [Secret Store](../architecture/secret-store.md) and writes a `__secret_*` sentinel in `brika.yml`.

## Config field types

The same schema applies to `bricks[*].config` and top-level `preferences`.

| `type` | Notes |
|---|---|
| `text` | One-line text input. `default`, `placeholder`, `secret` |
| `multiline` | Textarea |
| `number` | `default`, `min`, `max`, `step` |
| `slider` | Number with a slider control |
| `checkbox` | Boolean |
| `dropdown` | Fixed options. `options: [{ value, label }]` |
| `dynamic-dropdown` | Options resolved at runtime via `definePreferenceOptions(name, provider)` |

## Engines

```json
"engines": {
  "brika": "^0.3.0"
}
```

The hub refuses to load a plugin whose `engines.brika` range does not include the running hub version. Aim to match the SDK version you wrote against.

## A complete example

```json
{
  "$schema": "https://schema.brika.dev/plugin.schema.json",
  "name": "@brika/plugin-timer",
  "displayName": "Timer",
  "version": "0.3.1",
  "description": "Timer and countdown blocks for BRIKA workflows",
  "author": "BRIKA Team",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/brikalabs/brika.git",
    "directory": "plugins/timer"
  },
  "icon": "./icon.svg",
  "keywords": ["brika", "brika-plugin", "timer", "countdown"],
  "engines": { "brika": "^0.3.0" },
  "type": "module",
  "main": "./src/index.tsx",
  "blocks": [
    { "id": "timer", "name": "Timer", "category": "trigger", "icon": "timer", "color": "#22c55e" }
  ],
  "bricks": [
    {
      "id": "timers-dashboard",
      "name": "Timers Dashboard",
      "category": "monitoring",
      "icon": "timer",
      "color": "#22c55e",
      "config": [
        { "type": "number", "name": "refreshInterval", "label": "Refresh (ms)", "default": 5000 }
      ]
    }
  ],
  "sparks": [
    { "id": "timer-started", "name": "Timer Started" },
    { "id": "timer-completed", "name": "Timer Completed" }
  ],
  "dependencies": { "@brika/sdk": "workspace:*" },
  "files": ["src", "locales", "icon.svg", "README.md"]
}
```

## See also

* **[Reactive Blocks](reactive-blocks.md)** — building blocks declared in the manifest.
* **[Bricks](bricks.md)** — building bricks.
* **[Permissions](permissions.md)** — the permission model.
* **[Schema Generation](../architecture/schema-generation.md)** — how the schema is published.
