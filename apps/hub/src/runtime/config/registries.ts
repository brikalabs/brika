/**
 * Registry descriptors: a single declarative way to define a plugin registry, so adding a new one is
 * one config entry rather than edits scattered across the codebase.
 *
 * A registry is described by four things, mirroring how the hub uses it:
 *   - `name`:      display label (UI, `brika registry list`)
 *   - `pluginUrl`: template for a plugin's public web page (`{name}` is the package name)
 *   - `search`:    how the hub discovers plugins (`npm` keyword search, or a `/v1` store at `url`)
 *   - `install`:   the npm-protocol registry packages install from
 *   - `readme`:    where README/icon come from (`unpkg` CDN, or the `/v1` store)
 *
 * Operators declare extra registries in `brika.yml` under `registries:`; those are merged over the
 * built-in `npm` + `brika` presets by `id`. The legacy `defaultRegistry` / `npmRegistries` /
 * `searchStores` keys remain the runtime routing state and are unioned with what a registry declares.
 */

import { z } from 'zod';

const BRIKA_DEFAULT_REGISTRY = 'https://registry.brika.dev';
const BRIKA_DEFAULT_STORE = 'https://store.brika.dev';

/** Drop a trailing slash so templated/joined URLs never double up. */
const trim = (url: string): string => url.trim().replace(/\/$/, '');

/** How the hub discovers plugins from a registry. `v1` needs a store `url`; `npm` uses public npm. */
const SearchSchema = z.object({
  type: z.enum(['npm', 'v1']),
  url: z.string().optional(),
});

/** The npm-protocol registry packages install from. */
const InstallSchema = z.object({
  registry: z.string().optional(),
});

/** Where a registry's README/icon assets come from. */
const ReadmeSchema = z.object({
  type: z.enum(['v1', 'unpkg']),
});

/**
 * One registry definition. Everything but `id`/`name` is optional so a partial operator entry can
 * override just one field of a built-in preset (matched by `id`).
 */
export const RegistryDescriptorSchema = z.object({
  /** Stable identifier, also the merge key against the built-in presets (`npm`, `brika`). */
  id: z.string().min(1),
  /** Display label. */
  name: z.string().min(1),
  /** Plugin web-page template; `{name}` is replaced with the package name (e.g. `@scope/plugin`). */
  pluginUrl: z.string().optional(),
  search: SearchSchema.optional(),
  install: InstallSchema.optional(),
  readme: ReadmeSchema.optional(),
  /** The auto-route install probe target (informational; install routing still uses `defaultRegistry`). */
  default: z.boolean().optional(),
});

export type RegistryDescriptor = z.infer<typeof RegistryDescriptorSchema>;

/** Validates a `registries:` block, dropping malformed entries rather than failing the whole load. */
const RegistriesSchema = z.array(RegistryDescriptorSchema).catch([]);

/** Env-resolved Brika store base (`BRIKA_STORE_URL` overrides the default). */
function brikaStore(): string {
  return trim(process.env.BRIKA_STORE_URL || BRIKA_DEFAULT_STORE);
}
/** Env-resolved Brika install registry (`BRIKA_REGISTRY_URL` overrides the default). */
function brikaRegistry(): string {
  return trim(process.env.BRIKA_REGISTRY_URL || BRIKA_DEFAULT_REGISTRY);
}

/**
 * Built-in registry presets, env-resolved. These ship with every hub so the common case (npm + the
 * Brika store) needs no config; operators only declare registries beyond these.
 */
export function builtinRegistries(): RegistryDescriptor[] {
  const store = brikaStore();
  return [
    {
      id: 'npm',
      name: 'npm',
      pluginUrl: 'https://www.npmjs.com/package/{name}',
      search: { type: 'npm' },
      install: { registry: 'https://registry.npmjs.org' },
      readme: { type: 'unpkg' },
    },
    {
      id: 'brika',
      name: 'Brika Store',
      pluginUrl: `${store}/{name}`,
      search: { type: 'v1', url: store },
      install: { registry: brikaRegistry() },
      readme: { type: 'v1' },
      default: true,
    },
  ];
}

/** Parse the raw `registries:` block from `brika.yml` into validated operator descriptors. */
export function parseOperatorRegistries(raw: unknown): RegistryDescriptor[] {
  if (raw === undefined) {
    return [];
  }
  return RegistriesSchema.parse(raw).map(normalizeUrls);
}

/**
 * Trim the URLs a descriptor carries so joins/templates stay consistent. Absent fields stay absent
 * (no explicit `undefined`), so a partial operator entry only overrides the fields it actually sets
 * when merged over a preset in {@link resolveRegistries}.
 */
function normalizeUrls(descriptor: RegistryDescriptor): RegistryDescriptor {
  const out: RegistryDescriptor = { ...descriptor };
  if (out.pluginUrl !== undefined) {
    out.pluginUrl = out.pluginUrl.trim();
  }
  if (out.search?.url) {
    out.search = { ...out.search, url: trim(out.search.url) };
  }
  if (out.install?.registry) {
    out.install = { registry: trim(out.install.registry) };
  }
  return out;
}

/**
 * The effective registry catalogue: built-in presets with operator entries merged over them by `id`
 * (a partial operator entry overrides only the fields it sets). New ids are appended.
 */
export function resolveRegistries(operatorRegistries: RegistryDescriptor[]): RegistryDescriptor[] {
  const byId = new Map<string, RegistryDescriptor>();
  for (const preset of builtinRegistries()) {
    byId.set(preset.id, preset);
  }
  for (const entry of operatorRegistries) {
    const existing = byId.get(entry.id);
    byId.set(entry.id, existing ? { ...existing, ...entry } : entry);
  }
  return [...byId.values()];
}

/** The `/v1` store base URLs an explicit operator entry declares (built-ins excluded). */
export function operatorSearchStores(operatorRegistries: RegistryDescriptor[]): string[] {
  return operatorRegistries
    .filter((r) => r.search?.type === 'v1' && r.search.url)
    .map((r) => r.search?.url)
    .filter((url): url is string => url !== undefined);
}

/** Apply a `pluginUrl` template (`{name}` → the package name). */
export function applyPluginUrl(template: string, name: string): string {
  return template.replaceAll('{name}', name);
}

/** The registry whose `/v1` search store is `base`, if any. */
function v1RegistryForBase(
  registries: RegistryDescriptor[],
  base: string
): RegistryDescriptor | undefined {
  return registries.find((r) => r.search?.type === 'v1' && r.search.url === trim(base));
}

/**
 * The public web page for a plugin served by the `/v1` store at `base`: the matching registry's
 * `pluginUrl` template, falling back to `<base>/<name>` when no descriptor matches.
 */
export function pluginUrlForStore(
  registries: RegistryDescriptor[],
  base: string,
  name: string
): string {
  const template = v1RegistryForBase(registries, base)?.pluginUrl;
  if (template) {
    return applyPluginUrl(template, name);
  }
  return `${trim(base)}/${name}`;
}

/**
 * Where README/icon for a plugin on the `/v1` store at `base` come from: the matching registry's
 * `readme.type`, defaulting to `v1` (the natural source for a `/v1` store). A registry that declares
 * `readme: unpkg` keeps its search on the store but serves assets from the npm CDN instead.
 */
export function readmeSourceForStore(
  registries: RegistryDescriptor[],
  base: string
): 'v1' | 'unpkg' {
  return v1RegistryForBase(registries, base)?.readme?.type ?? 'v1';
}

/** An "Open in <name>" link: the registry's display name plus the resolved plugin web URL. */
export interface ExternalRegistryLink {
  name: string;
  url: string;
}

/** "Open in <store>" target for a plugin served by the `/v1` store at `base`. */
export function externalLinkForStore(
  registries: RegistryDescriptor[],
  base: string,
  name: string
): ExternalRegistryLink {
  const registry = v1RegistryForBase(registries, base);
  return { name: registry?.name ?? 'Store', url: pluginUrlForStore(registries, base, name) };
}

/**
 * "Open in <registry>" target for an npm-sourced plugin: the npm registry descriptor's name and
 * `pluginUrl` template. Undefined when no npm registry declares a `pluginUrl`.
 */
export function externalLinkForNpm(
  registries: RegistryDescriptor[],
  name: string
): ExternalRegistryLink | undefined {
  const registry = registries.find((r) => r.search?.type === 'npm');
  if (!registry?.pluginUrl) {
    return undefined;
  }
  return { name: registry.name, url: applyPluginUrl(registry.pluginUrl, name) };
}
