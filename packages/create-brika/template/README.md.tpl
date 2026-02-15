# {{packageName}}

{{description}}

## Installation

```bash
bun add {{packageName}}
```

## Usage

Add the plugin to your `brika.yml`:

```yaml
plugins:
  "{{packageName}}":
    enabled: true
```

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
