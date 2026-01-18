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

## Blocks

### {{blockNamePascal}}

{{description}}

**Inputs:**
- `in` - Input data to process

**Outputs:**
- `out` - Processed output

**Configuration:**
- `enabled` (boolean) - Enable processing (default: true)

## Development

```bash
# Link for local development
bun link

# Type check
bun run tsc
```

## License

MIT
