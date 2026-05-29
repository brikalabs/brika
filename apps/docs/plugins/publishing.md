# Publishing

Plugins are regular npm packages. Once you have working code, publishing is a `bun publish` away — but Brika ships a verification CLI you should run first to catch the most common mistakes before they reach users.

## Pre-publish checklist

1. `bun run typecheck` — no TypeScript errors.
2. `bun test` — your unit tests pass.
3. `bunx brika-verify-plugin` — manifest valid, source matches.
4. `package.json` has the right `files` array, `version` bumped, `engines.brika` set.

The third step is the important one — it runs the [verify-checks](#what-the-verifier-does) suite against your plugin.

## `brika-verify-plugin`

```sh
bunx brika-verify-plugin
```

The CLI:

1. Loads `package.json` and validates it against the published [plugin schema](../architecture/schema-generation.md).
2. Runs every registered check (auto-discovered from `@brika/sdk/verify-checks`).
3. Prints errors and warnings; exits non-zero on any error.

Wire it as a `prepublishOnly` script in `package.json` so npm calls it automatically:

```json
"scripts": {
  "prepublishOnly": "brika-verify-plugin"
}
```

`bun publish` and `npm publish` both honour `prepublishOnly`. A failed verifier blocks the publish — no broken plugins reach the registry.

## What the verifier does

Each check is a function registered with `registerCheck()` that receives a typed `CheckContext { pkg, pluginDir, sdkVersion }` and returns `{ errors?: string[]; warnings?: string[] }`. The built-in checks include:

* **main** — the entry file declared in `main` actually exists.
* **engines** — `engines.brika` is a parseable semver range and compatible with the SDK version.
* **publish-files** — every file listed in `files` resolves; nothing that should ship is excluded.
* **schema-url** — `$schema` points at `https://schema.brika.dev/plugin.schema.json`.
* **keywords** — `"brika"` and `"brika-plugin"` are present (used by the registry's search index).

Plugins can register their own checks too — useful for shipping verification rules to internal teams.

## The npm package

Publish like any other package:

```sh
bun publish              # for scoped packages defaults to private; pass --access=public for the public registry
bun publish --tag canary # publish under a tag instead of latest
```

If your package starts with `@your-scope/`, npm requires `--access=public` the first time you publish a free-account scoped package.

## What ships

Set `files` in `package.json` to control what ends up in the published tarball:

```json
"files": ["src", "locales", "icon.svg", "README.md"]
```

The hub compiles `src/` at install time, so you ship source rather than a built bundle. Avoid bundling — the compiler needs the original source for the [externals rewrite](../architecture/externals-rewrite.md) and Tailwind scanning to work.

## Listing on the Brika registry

Once your package is on npm with the `brika-plugin` keyword, the curated registry's indexer picks it up on the next refresh cycle. To skip the wait or push to the verified set, follow the contribution process documented at [github.com/brikalabs/registry](https://github.com/brikalabs/registry).

## Versioning

Use semver:

* **Patch** for backwards-compatible fixes — `0.3.1 → 0.3.2`.
* **Minor** for new blocks/bricks/sparks/actions, new manifest fields — `0.3.2 → 0.4.0`.
* **Major** for renamed blocks/bricks (their saved IDs would break), removed APIs, breaking schema changes — `0.4.0 → 1.0.0`.

Renaming an exported action changes its compiled ID — see [Actions](actions.md). Treat that as a major version.

## See also

* **[Manifest Reference](manifest.md)** — the schema the verifier validates against.
* **[Schema Generation](../architecture/schema-generation.md)** — how the published schema is built.
* **[Testing](testing.md)** — running the verifier as part of CI.
