---
"@brika/sdk": patch
"@brika/plugin-agent": patch
---

Make the curated public surface actually publishable to npm.

- `@brika/sdk`: promote `@brika/flow`, `@brika/ui-kit`, and `@brika/serializable` to `dependencies` so an npm-installed plugin resolves the SDK's raw-`.ts` runtime closure instead of crashing on first load.
- `create-brika`: move `@brika/cli` to `devDependencies` (it is bundled into `dist/index.js`), avoiding a published manifest that depends on a private package.
- Standardize the shipped packages on a `files[]` allowlist (dropping `.npmignore`) so tarballs no longer leak tests, tsconfigs, or build caches.

(Naming one member of each fixed group bumps the whole group: the platform line via `@brika/sdk`, the plugin line via `@brika/plugin-agent`.)
