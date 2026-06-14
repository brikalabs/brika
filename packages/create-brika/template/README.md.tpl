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
brika dev      # develop against a running hub, with hot-reload
brika build    # regenerate the plugin manifest from your source
brika check    # lint + typecheck
brika verify   # validate package.json before publishing
```

## Publishing

```bash
brika publish              # build + verify + publish to npm
brika publish --dry-run    # rehearse without publishing
```

Pushing a `v*` git tag also publishes via the scaffolded
`.github/workflows/release.yml`, with npm provenance over OIDC (no token). One
time on npmjs.com: after the first publish, add this repo + `release.yml` as the
package's Trusted Publisher.

## License

MIT
