# {{packageName}}

{{description}}

## Installation

```bash
bun add {{packageName}}
```

## Usage

Add the plugin to your `brika.yml` — plugins are keyed by package name and
need a version specifier (`workspace:*` for local dev, a semver range for
npm-installed):

```yaml
plugins:
  "{{packageName}}":
    version: "workspace:*"
```

## Capabilities

Plugins declare the hub-mediated I/O they need under `capabilities` in
`package.json`. The default scaffold doesn't request any. When you need to
make HTTP requests, read secrets, or access the filesystem, add the
matching capability and use the typed `ctx` surface:

```jsonc
// package.json
{
  "capabilities": {
    "dev.brika.net.fetch":   { "allow": ["api.example.com"] },
    "dev.brika.secrets.get": {},
    "dev.brika.secrets.set": {}
  }
}
```

```ts
import { ctx, onInit } from '@brika/sdk';

onInit(async () => {
  const res = await ctx.net.fetch({ url: 'https://api.example.com/data' });
  // res is { status, statusText, headers, body, attempts }
  await ctx.secrets.set({ key: 'last-sync', value: new Date().toISOString() });
});
```

See [the capability reference](https://github.com/brikalabs/brika/blob/main/apps/docs/architecture/capabilities.md)
for the full list of capabilities, scopes, and the manifest format.

{{#blocks}}
## Blocks

### {{pascal}}

{{description}}

**Inputs:** `in` — Input data to process

**Outputs:** `out` — Processed output

{{/blocks}}
{{#bricks}}
## Bricks

### {{pascal}}

Board brick with responsive layouts for small, medium, and large sizes.

{{/bricks}}
{{#sparks}}
## Sparks

### {{pascal}}

Event emitted by this plugin.

{{/sparks}}
## Development

```bash
# Link for local development
bun link

# Type check
bun run tsc
```

## License

MIT
