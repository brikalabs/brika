# Registries

The hub discovers and installs plugins from one or more **registries**. A registry is split into two
independent contracts, and only one of them is Brika-specific:

| Concern | Contract | Where |
|---|---|---|
| **Install** | the standard **npm registry protocol** (packument + tarball) | any npm-compatible registry |
| **Search / detail** | the Brika **`/v1` store** JSON contract | a Brika store (e.g. `store.brika.dev`) |

You can use either independently: a registry can serve installs without being searchable, and a store
can power search without owning a package scope.

## Defaults

Out of the box the hub points at the Brika registry and store:

| Source | URL | Used for |
|---|---|---|
| default registry | `https://registry.brika.dev` | install (npm protocol) |
| search store | `https://store.brika.dev` | search + plugin detail (`/v1`) |

Both are overridable per deployment with `BRIKA_REGISTRY_URL` / `BRIKA_STORE_URL`, or in `brika.yml`.

## Install: the registry hosts plugins, npm hosts dependencies

The registry is used **only to download the plugin package itself**. Every dependency, including
same-scope ones like `@brika/sdk`, resolves from **public npm**. This is a hard rule: the Brika
registry hosts plugins, not their dependency trees.

To honor it, the hub installs a plugin **by its tarball** rather than by scope-routing npm. When you run:

```sh
brika install @myscope/tada
```

the hub fetches the **default registry**'s npm packument for the package, reads the requested version's
`dist.tarball`, and installs that tarball directly. bun then resolves the plugin's dependencies from
public npm as usual. If the registry doesn't host the package, the install falls through to a plain npm
install unchanged.

```
brika install @myscope/tada
  → GET registry.brika.dev/@myscope%2Ftada            → 200 packument
  → dist.tarball = …/@myscope/tada/-/tada-1.0.0.tgz
  → bun install @myscope/tada@<tarball>               (plugin from Brika, deps from npm)
```

> A scope-wide `.npmrc` route (`@scope:registry=…`) is intentionally **not** used for this, because it
> would send a plugin's same-scope dependencies to the registry too. `npmRegistries` (below) remains as
> a manual override for operators who explicitly want a whole scope pinned to a third-party registry.

## Search

Search is **federated** over every configured store. Each `/v1` store is queried in parallel and the
results are merged and de-duplicated by package name (the first store wins on a tie). A store that is
unreachable is skipped rather than failing the whole search. Plugin detail tries each store in turn and
returns the first hit, since stores aren't scope-bound.

If no store is configured, the hub falls back to npm search (`keywords:brika`).

## Configuration (`brika.yml`)

```yaml
# The registry whose packument is read to resolve a plugin's tarball at install
# time (the plugin is fetched from there; its deps still come from npm). Omit to
# install purely from public npm.
defaultRegistry: https://registry.brika.dev

# Manual scope → npm registry overrides, written to the plugins-dir `.npmrc`. This
# routes the WHOLE scope (deps included) to a registry, so it is an explicit opt-in
# for third-party registries; the default plugin install does not populate it.
npmRegistries:
  "@acme": https://npm.acme.com

# /v1 stores searched (and read for plugin detail), unioned. A store need not
# own a scope, so a pure discovery source is fine here.
searchStores:
  - https://store.brika.dev
  - https://store.acme.com
```

All three keys are optional; omitting them uses the Brika defaults above.

## Declarative registries (`registries:`)

The keys above are the runtime routing state. To **define a registry** in one place, declare it under
`registries:`. Each entry names the registry and says how to build its plugin URL, how to search it,
where it installs from, and where its README/icon come from, so adding a registry is one config block
rather than edits scattered across the app:

```yaml
registries:
  - id: acme                                   # stable id; also the merge key against built-ins
    name: Acme Store                           # display label (UI, `brika registry list`)
    pluginUrl: "https://store.acme.com/{name}" # plugin web page; {name} = the package name
    search:  { type: v1, url: "https://store.acme.com" }   # type: v1 (a /v1 store) or npm
    install: { registry: "https://npm.acme.com" }          # npm-protocol install registry
    readme:  { type: v1 }                                  # v1 (the store) or unpkg (npm CDN)
```

Two presets ship built in and need no declaration: **`npm`** (search via npm, README/icon from the
unpkg CDN, `pluginUrl` → npmjs.com) and **`brika`** (the Brika store, `default: true`). A `registries:`
entry whose `id` matches a preset overrides only the fields it sets (e.g. rename `brika` or point it at
your mirror); a new `id` is appended.

A registry's `search.type: v1` store is unioned into the effective search set (the same set the flat
`searchStores` list feeds), and its `pluginUrl` template is what powers the "Open in store" link on a
plugin's detail page. `id: npm` / `id: brika` keep their built-in URLs unless you override them.

## Managing registries from the CLI

```sh
brika registry list                                                  # show the current config
brika registry add @acme https://npm.acme.com                        # route a scope's installs
brika registry add @acme https://npm.acme.com --store https://store.acme.com  # + federated search
```

`add` persists to `brika.yml` and rewrites the install `.npmrc` through the running hub (started if
needed), so the change applies without a restart. `--store` additionally registers a `/v1` store for
search. Both commands talk to the hub over loopback.

## Running your own registry

To host installable plugins, expose the **npm registry protocol**: a packument at `GET /<name>` (scoped:
`/@scope%2Fname`) with `dist.tarball` + `dist.integrity`, and the tarball at `…/-/<name>-<version>.tgz`.
Any npm-compatible server qualifies (Verdaccio, GitHub Packages, a custom Worker). Operators point at it
with `brika registry add <scope> <url>` or by setting it as `defaultRegistry`.

To be **searchable** as a Brika store, implement the `/v1` contract:

| Endpoint | Response |
|---|---|
| `GET /v1/search?q=&limit=&offset=` | `{ plugins: PluginSummary[], total }` |
| `GET /v1/plugins/<name>` | `PluginDetail` |

`PluginSummary` requires `name`, `version`, `brikaEngine`; optional `displayName`, `description`,
`author{id,name?}`, `keywords`, `downloadsWeekly`, `publishedAt`. `PluginDetail` extends it with optional
`repository`, `homepage`, `license`, `grants`. Operators add it with `brika registry add … --store <url>`.

> A package is a *plugin* by virtue of its `package.json` (`engines.brika`, `main`, plus the store
> metadata required to publish), not by anything the registry does. See
> [Manifest Reference](../plugins/manifest.md) and [Publishing](../plugins/publishing.md).

## Adding a source inside the hub

The contracts above are HTTP. If you instead want a new *kind* of in-process source (not just another
URL), implement the one-method `RegistrySource` interface (`search() → { plugins, total }`) like the
built-in `LocalRegistry`, `NpmRegistry`, and `RemoteRegistrySource` sources, and register it with the
`StoreService`.
