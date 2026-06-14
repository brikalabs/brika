---
"@brika/sdk": patch
"@brika/plugin-agent": patch
---

Make the curated public surface actually publishable to npm.

- `@brika/sdk`: publish a self-contained `tsdown` bundle (`build:dist`) with its private runtime closure (`@brika/errors`, `@brika/flow`, `@brika/grants`, `@brika/ipc`, `@brika/serializable`, `@brika/ui-kit`) inlined, so those packages stay private `devDependencies` and an npm-installed plugin depends on `@brika/sdk` alone (plus its real external deps) instead of resolving raw `.ts` from private packages. The committed `exports` keep pointing at `./src` for zero-build dev; the publisher repoints them to the built `dist/pkg` bundle.
- `create-brika`: move `@brika/cli` to `devDependencies` (it is bundled into `dist/index.js`), avoiding a published manifest that depends on a private package.
- Standardize the shipped packages on a `files[]` allowlist (dropping `.npmignore`) so tarballs no longer leak tests, tsconfigs, or build caches.

(Naming one member of each fixed group bumps the whole group: the platform line via `@brika/sdk`, the plugin line via `@brika/plugin-agent`.)
