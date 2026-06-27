import { createHash } from 'node:crypto';
import { mkdir, readlink, rename, rm, symlink, unlink } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { inject, singleton } from '@brika/di';
import { classifyNetworkError, errors } from '@brika/errors';
import { resolveSystemDir } from '@brika/sdk/exec-context';
import { semver } from 'bun';
import { z } from 'zod';
import { BunRunner, ConfigLoader, HubConfig } from '@/runtime/config';
import { Logger } from '@/runtime/logs/log-router';
import { generateUid } from '@/runtime/plugins/utils';
import { StateStore } from '@/runtime/state/state-store';
import { PackageManager } from './package-manager';
import { errorFields } from './progress';
import type { InstalledPackage, OperationProgress, UpdateInfo } from './types';

/** A package.json `workspaces` field: a glob array, or `{ packages: [...] }`. */
const WorkspacesSchema = z.union([
  z.array(z.string()),
  z.object({ packages: z.array(z.string()) }).transform((o) => o.packages),
]);

/**
 * The subset of an npm packument the hub reads to resolve a plugin's tarball URL + integrity. Unknown
 * keys are dropped; `tarball`/`integrity` are optional so a version without a full dist block degrades
 * gracefully (no throw).
 */
const RegistryPackumentSchema = z.object({
  'dist-tags': z.record(z.string(), z.string()).optional(),
  versions: z
    .record(
      z.string(),
      z.object({
        dist: z
          .object({ tarball: z.string().optional(), integrity: z.string().optional() })
          .optional(),
      })
    )
    .optional(),
});

type PackumentVersions = NonNullable<z.infer<typeof RegistryPackumentSchema>['versions']>;

/** A plugin tarball resolved from a registry packument: where to fetch it, how to verify it, and the
 *  concrete version it resolved to (recorded in brika.yml for reproducibility). */
interface ResolvedTarball {
  tarball: string;
  integrity?: string;
  version: string;
}

/**
 * The greatest available version satisfying a semver `range`, or null when none do. bun's `semver` has
 * `satisfies`/`order` but no `maxSatisfying`, so fold over the candidates.
 */
function maxSatisfying(versions: string[], range: string): string | null {
  let best: string | null = null;
  for (const candidate of versions) {
    try {
      if (
        semver.satisfies(candidate, range) &&
        (best === null || semver.order(candidate, best) > 0)
      ) {
        best = candidate;
      }
    } catch {
      // a non-version key or unparseable range simply does not match
    }
  }
  return best;
}

/**
 * Resolve a requested spec against a registry packument to a concrete hosted version, honoring the npm
 * grammar: no spec / `latest` → the latest dist-tag; an exact version → itself when hosted; a dist-tag
 * (e.g. `beta`) → its target; otherwise a semver range → the greatest satisfying version. Returns null
 * when an exact pin or range is requested that the registry does NOT serve, so the caller falls back to
 * npm (where the pin may exist) instead of silently substituting `latest`.
 */
function resolvePackumentVersion(
  versions: PackumentVersions,
  distTags: Record<string, string>,
  requested?: string
): string | null {
  if (!requested || requested === 'latest') {
    return distTags.latest ?? null;
  }
  if (requested in versions) {
    return requested;
  }
  if (requested in distTags) {
    return distTags[requested] ?? null;
  }
  return maxSatisfying(Object.keys(versions), requested);
}

/**
 * True when an installed manifest spec points at a REGISTRY tarball rather than a public-npm version:
 * an http(s) URL, or the verified `.tgz` we cached and installed by `file:`. Such a plugin is updated by
 * re-resolving the registry packument (bun cannot bump a pinned URL/file spec).
 */
function isRegistrySpec(spec?: string | null): boolean {
  if (!spec) {
    return false;
  }
  if (spec.startsWith('https://') || spec.startsWith('http://')) {
    return true;
  }
  return spec.startsWith('file:') && spec.endsWith('.tgz');
}

/**
 * A manually-symlinked LOCAL plugin in the manifest: `workspace:*`, or a `file:` DIRECTORY. Distinct
 * from a verified registry `.tgz` installed by `file:` (kept; bun manages it like any dep). The dir
 * specs make `bun install` abort, so init() prunes them.
 */
function isLocalPluginSpec(spec?: string): boolean {
  if (spec?.startsWith('workspace:')) {
    return true;
  }
  return spec?.startsWith('file:') === true && !spec.endsWith('.tgz');
}

function normalizeVersion(version?: string): string | undefined {
  // Bare absolute paths → file: specifier
  if (version?.startsWith('/')) {
    return `file:${version}`;
  }
  return version;
}

function isLocalVersion(version?: string): version is string {
  return version?.startsWith('workspace:') === true || version?.startsWith('file:') === true;
}

/**
 * Human label for the registry a spec resolves from: the host of an http(s) tarball/URL spec (e.g.
 * `registry.brika.dev`), otherwise `npm` (a bare version resolves from the public npm registry).
 */
function registrySource(spec?: string | null): string {
  if (spec?.startsWith('https://') || spec?.startsWith('http://')) {
    try {
      return new URL(spec).host;
    } catch {
      return 'the registry';
    }
  }
  return 'npm';
}

/**
 * True only when `candidate` is a strictly newer release than `installed`.
 *
 * The registry's "latest" can legitimately be *older* than what's installed
 * (e.g. a locally-built plugin bumped ahead of the published npm version), so a
 * plain `installed !== candidate` would offer a downgrade as an "update".
 * `semver.order` throws on non-semver input; treat anything uncomparable as
 * "no upgrade" rather than letting one bad version break the whole check.
 */
function isUpgrade(installed: string, candidate: string): boolean {
  try {
    return semver.order(candidate, installed) > 0;
  } catch {
    return false;
  }
}

@singleton()
export class PluginRegistry {
  private readonly hubConfig = inject(HubConfig);
  private readonly logs = inject(Logger).withSource('registry');
  private readonly configLoader = inject(ConfigLoader);
  private readonly bunRunner = inject(BunRunner);
  private readonly state = inject(StateStore);
  readonly pluginsDir: string;
  readonly #pm: PackageManager;

  constructor() {
    // Use absolute path for Bun.resolveSync compatibility. The installed-plugins
    // tree lives under the hidden `.system/` dir, alongside the rest of the
    // hub-managed data.
    this.pluginsDir = resolve(resolveSystemDir(this.hubConfig.homeDir), 'plugins');
    this.#pm = new PackageManager(this.bunRunner, this.pluginsDir);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    const pkgPath = join(this.pluginsDir, 'package.json');
    if (!(await Bun.file(pkgPath).exists())) {
      await Bun.write(
        pkgPath,
        JSON.stringify(
          {
            name: 'brika-plugins',
            private: true,
            dependencies: {},
          },
          null,
          2
        )
      );
      this.logs.info('Plugin registry initialized', {
        directory: this.pluginsDir,
      });
    }
    // Local/workspace plugins are symlinked into node_modules and tracked in brika.yml, never managed
    // by bun. A stale `workspace:*` / `file:` entry in this (non-workspace) manifest makes every
    // `bun install` fail to resolve it, so prune any before they break a registry install.
    await this.#pruneLocalManifestDeps();
    // Route installs per scope: write the configured scope->registry map to the plugins-dir `.npmrc`,
    // one `@scope:registry=<url>` line each. Both `bun install` and the `npm view` update check run in
    // pluginsDir, so both honor it; any scope not listed falls back to the public npm registry.
    // Rewritten every init so config edits take effect on the next start.
    const { npmRegistries } = await this.configLoader.load();
    const npmrc = Object.entries(npmRegistries ?? {})
      .map(([scope, url]) => `${scope}:registry=${url}`)
      .join('\n');
    await Bun.write(join(this.pluginsDir, '.npmrc'), npmrc ? `${npmrc}\n` : '');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Install / Uninstall
  // ─────────────────────────────────────────────────────────────────────────────

  async *install(name: string, version?: string): AsyncGenerator<OperationProgress> {
    version = normalizeVersion(version);
    const local = isLocalVersion(version);

    // Only roll back state THIS install created: never tear down a working
    // prior install when a re-install/upgrade fails midway.
    const preExisting = await this.has(name);
    let loaded = false;

    try {
      yield this.#msg('resolving', 'install', name, version);

      let rootDirectory: string | undefined;
      if (isLocalVersion(version)) {
        rootDirectory = await this.#linkLocalPlugin(name, version);
      } else {
        // Install the plugin itself from the registry when it hosts the requested version; its deps
        // resolve from public npm. The tarball is downloaded + integrity-verified, then installed from a
        // local `file:` path. A scope-wide `.npmrc` route is deliberately NOT written: it would send
        // same-scope deps (e.g. @brika/sdk) to the registry too, which only hosts plugins.
        const resolved = await this.#resolveRegistryTarball(name, version);
        if (resolved) {
          yield this.#msg(
            'downloading',
            'install',
            name,
            resolved.version,
            `Downloading from ${registrySource(resolved.tarball)} (verified, dependencies from npm)`
          );
          const tarball = await this.#downloadVerifiedTarball(resolved, name);
          yield* this.#installNpm(name, `file:${tarball}`);
        } else {
          yield this.#msg('downloading', 'install', name, version, 'Downloading from npm');
          yield* this.#installNpm(name, version);
        }
      }

      yield this.#msg('linking', 'install', name, version, 'Loading plugin...');
      // Local/dev plugins are the operator's own code: start them immediately.
      // A remote (npm) plugin that requests grants installs dormant until the
      // operator reviews and enables it (consent-before-code).
      await this.#loadPlugin(rootDirectory ?? name, local ? true : undefined);
      loaded = true;

      // Record in brika.yml LAST, only after the load attempt: a THROWN install
      // failure then leaves no config/filesystem split. (Note this is NOT
      // "config only references healthy plugins": #loadResolved returns rather
      // than throws on build-failure / incompatibility / awaiting-config, and
      // those plugins are legitimately recorded.)
      // Record the CONCRETE version actually on disk, not the requested spec: a range/tag/`latest`
      // resolves to a specific release, and recording that keeps brika.yml reproducible and lets
      // update-checks compare against it. A local plugin keeps its file:/workspace spec (re-linked on
      // boot).
      const recordedVersion = local
        ? (version ?? 'latest')
        : ((await this.#getVersion(name)) ?? version ?? 'latest');
      await this.configLoader.addPlugin(name, recordedVersion);

      // A grant-requesting remote plugin installs dormant (consent-before-code);
      // tell the operator it needs review rather than reporting a plain success.
      const dormant = this.state.get(name)?.enabled === false;
      yield this.#msg(
        'complete',
        'install',
        name,
        version,
        dormant
          ? 'Installed (disabled): review its requested permissions, then enable it'
          : 'Installed successfully'
      );
    } catch (error) {
      if (!preExisting) {
        await this.#rollbackInstall(name, local, loaded);
      }
      yield this.#errorMsg('install', name, version, error);
    }
  }

  /**
   * Best-effort teardown of the filesystem (and load) state a failed install
   * created, so it leaves no half-installed plugin behind. Never throws (a
   * rollback failure must not mask the original error) and is only called for
   * plugins this install introduced (see the preExisting guard in install()).
   */
  async #rollbackInstall(name: string, local: boolean, loaded: boolean): Promise<void> {
    try {
      if (loaded) {
        await this.#unloadPlugin(name);
      }
      if (local) {
        await unlink(join(this.pluginsDir, 'node_modules', name)).catch(() => undefined);
      } else {
        // `bun remove` clears node_modules; #removeDependency below covers the
        // case where it could not run, so a half-installed npm package does not
        // get skipped by #ensureSyncedPlugins' has()-check on the next boot.
        await this.#pm.remove(name).catch(() => undefined);
      }
      await this.#removeDependency(name);
    } catch (error) {
      this.logs.warn('Install rollback failed', { pluginName: name }, { error });
    }
  }

  async uninstall(name: string): Promise<void> {
    await this.#unloadPlugin(name);
    await this.configLoader.removePlugin(name);

    const linkPath = join(this.pluginsDir, 'node_modules', name);
    const isSymlink = await readlink(linkPath).then(
      () => true,
      () => false
    );

    if (isSymlink) {
      // Workspace plugin: remove symlink and package.json entry
      await unlink(linkPath).catch(() => undefined);
      await this.#removeDependency(name);
    } else if (await Bun.file(join(linkPath, 'package.json')).exists()) {
      // NPM plugin: use package manager
      await this.#pm.remove(name);
    }

    // Reclaim the plugin's writable storage (data/cache/tmp under
    // `plugins/data/<uid>/`) immediately. The boot orphan-prune is only a
    // safety net for crashes/legacy rows; without this, uninstalling via the
    // CLI / config-sync path would leak quota-sized data until the next boot.
    await rm(join(this.pluginsDir, 'data', generateUid(name)), {
      recursive: true,
      force: true,
    });

    this.logs.info('Plugin uninstalled successfully', {
      packageName: name,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // List / Query
  // ─────────────────────────────────────────────────────────────────────────────

  async list(): Promise<InstalledPackage[]> {
    const packages: InstalledPackage[] = [];

    // NPM packages
    const npmPkgs = await this.#listNpm();
    packages.push(...npmPkgs);

    // Config packages (workspace/file)
    const config = this.configLoader.get();
    for (const entry of config.plugins) {
      if (!packages.some((p) => p.name === entry.name)) {
        packages.push({
          name: entry.name,
          version: entry.version,
          path: entry.version.startsWith('workspace:') ? 'workspace' : entry.version,
        });
      }
    }

    return packages;
  }

  async has(name: string): Promise<boolean> {
    return (await this.list()).some((p) => p.name === name);
  }

  async get(name: string): Promise<InstalledPackage | null> {
    return (await this.list()).find((p) => p.name === name) ?? null;
  }

  resolve(packageName: string): string | null {
    try {
      return Bun.resolveSync(packageName, this.pluginsDir);
    } catch {
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Update
  // ─────────────────────────────────────────────────────────────────────────────

  async *update(name?: string): AsyncGenerator<OperationProgress> {
    try {
      yield this.#msg('resolving', 'update', name ?? 'all');
      if (name) {
        // A single named update: bump it (re-resolve a registry tarball, or `bun update` an npm dep),
        // then reload so the new code actually runs (and recompiles, surfacing the build trace). Always
        // reload, even if unchanged, so a forced reinstall still takes effect. A reload that leaves the
        // plugin crashed surfaces as the operation error (not a misleading success).
        yield* this.#bumpPlugin(name);
        yield this.#msg('linking', 'update', name, undefined, `Reloading ${name}...`);
        await this.#loadPlugin(name);
        this.#assertNotCrashed(name);
      } else {
        // Update-all: one `bun update` pass bumps every bare-version npm dependency; registry-sourced
        // plugins (pinned tarball specs bun can't bump) are re-resolved individually. Reload each so the
        // updated code runs, tolerating a single failure so one bad plugin does not abort the batch.
        yield* this.#pm.update();
        for (const pkg of await this.#listNpm()) {
          try {
            if (isRegistrySpec(await this.#installedSpec(pkg.name))) {
              yield* this.#bumpRegistry(pkg.name);
            }
            yield this.#msg('linking', 'update', pkg.name, undefined, `Reloading ${pkg.name}...`);
            await this.#loadPlugin(pkg.name);
            this.#assertNotCrashed(pkg.name);
          } catch (error) {
            this.logs.error('Failed to update plugin', { pluginName: pkg.name }, { error });
          }
        }
      }
      yield this.#msg('complete', 'update', name ?? 'all', undefined, 'Updated successfully');
    } catch (error) {
      yield this.#errorMsg('update', name ?? 'all', undefined, error);
    }
  }

  /** Bump one plugin to the newest version available from its source (no reload). A registry plugin's
   *  recorded spec is a pinned tarball URL/file bun can't bump, so it is re-resolved against the registry
   *  packument; a bare-version npm plugin uses `bun update`. */
  async *#bumpPlugin(name: string): AsyncGenerator<OperationProgress> {
    if (isRegistrySpec(await this.#installedSpec(name))) {
      yield* this.#bumpRegistry(name);
    } else {
      yield this.#msg('downloading', 'update', name, undefined, 'Updating from npm');
      yield* this.#pm.update(name);
    }
  }

  /**
   * Re-resolve a registry plugin's current tarball and reinstall it from a freshly verified download
   * when the registry serves a newer version. A no-op when the registry no longer resolves it or it is
   * already up to date (so a forced single-update reload below still re-runs the same code).
   */
  async *#bumpRegistry(name: string): AsyncGenerator<OperationProgress> {
    const resolved = await this.#resolveRegistryTarball(name);
    if (!resolved) {
      return;
    }
    const current = await this.#getVersion(name);
    if (current && !isUpgrade(current, resolved.version)) {
      return;
    }
    yield this.#msg(
      'downloading',
      'update',
      name,
      resolved.version,
      `Updating to ${resolved.version} from ${registrySource(resolved.tarball)}`
    );
    const tarball = await this.#downloadVerifiedTarball(resolved, name);
    yield* this.#installNpm(name, `file:${tarball}`);
    await this.configLoader.addPlugin(name, resolved.version);
  }

  /**
   * Throw if a reload left the plugin crashed (e.g. the new version failed to build), so an install /
   * update reports the failure instead of a misleading "succeeded". #loadResolved returns (not throws)
   * on a build failure and marks health 'crashed', so a non-UI caller would otherwise see only success.
   */
  #assertNotCrashed(name: string): void {
    if (this.state.get(name)?.health === 'crashed') {
      throw errors.unavailable({
        message: `${name} failed to build; the previous version keeps running. Check the build log.`,
      });
    }
  }

  /** The version specifier recorded for an installed plugin in the bun manifest (tarball URL or version). */
  async #installedSpec(name: string): Promise<string | undefined> {
    try {
      const pkg = await Bun.file(join(this.pluginsDir, 'package.json')).json();
      const spec = pkg.dependencies?.[name];
      return typeof spec === 'string' ? spec : undefined;
    } catch {
      return undefined;
    }
  }

  async checkUpdates(): Promise<UpdateInfo[]> {
    const pkgPath = join(this.pluginsDir, 'package.json');
    if (!(await Bun.file(pkgPath).exists())) {
      return [];
    }

    const pkg = await Bun.file(pkgPath).json();
    const updates: UpdateInfo[] = [];

    for (const [name, _] of Object.entries(pkg.dependencies ?? {})) {
      const current = await this.#getVersion(name);
      const latest = await this.#getLatestVersion(name);

      if (current && latest) {
        updates.push({
          name,
          currentVersion: current,
          latestVersion: latest,
          updateAvailable: isUpgrade(current, latest),
        });
      }
    }

    return updates;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Sync
  // ─────────────────────────────────────────────────────────────────────────────

  async syncToConfig(
    entries: Array<{
      name: string;
      version: string;
    }>
  ): Promise<void> {
    const configNames = new Set(entries.map((e) => e.name));
    const installed = await this.list();

    await this.#removeStalePlugins(installed, configNames);
    await this.#ensureSyncedPlugins(entries);
  }

  async #removeStalePlugins(
    installed: InstalledPackage[],
    configNames: Set<string>
  ): Promise<void> {
    for (const pkg of installed) {
      if (configNames.has(pkg.name)) {
        continue;
      }
      try {
        await this.uninstall(pkg.name);
      } catch (error) {
        this.logs.error(
          'Failed to uninstall plugin during sync',
          { packageName: pkg.name },
          { error }
        );
      }
    }
  }

  async #ensureSyncedPlugins(entries: Array<{ name: string; version: string }>): Promise<void> {
    for (const entry of entries) {
      if (isLocalVersion(entry.version)) {
        try {
          await this.#linkLocalPlugin(entry.name, entry.version);
        } catch (error) {
          this.logs.error('Failed to link local plugin', { packageName: entry.name }, { error });
        }
      } else if (!(await this.has(entry.name))) {
        try {
          for await (const _ of this.install(entry.name, entry.version)) {
            // Consume progress
          }
        } catch (error) {
          this.logs.error(
            'Failed to install plugin during sync',
            { packageName: entry.name },
            { error }
          );
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Install an npm plugin, reclassifying a failure as a connectivity error when
   * the machine appears offline, so the operator gets "you may be offline, use a
   * local path" instead of an opaque `bun install` exit code. The coded error
   * rides the existing OperationProgress.errorCode/errorDetail fields.
   */
  async *#installNpm(name: string, version?: string): AsyncGenerator<OperationProgress> {
    try {
      yield* this.#pm.install(name, version);
    } catch (error) {
      if (await this.#online()) {
        throw error;
      }
      throw errors.unavailable({
        cause: error,
        message: `Could not install "${name}": the npm registry is unreachable (you may be offline). For a local plugin, use \`brika install <path>\`, which needs no network.`,
      });
    }
  }

  /**
   * Resolve a plugin's tarball (URL + integrity + concrete version) from the default registry's npm
   * packument. Installing by tarball fetches ONLY the plugin from the registry, while its dependencies
   * resolve from public npm (the Brika registry hosts plugins, not their deps). Returns null when no
   * default registry is set, it is unreachable, or it does not serve the requested package/version, so
   * the caller falls back to a plain npm install. Never throws.
   */
  async #resolveRegistryTarball(name: string, version?: string): Promise<ResolvedTarball | null> {
    const { defaultRegistry } = await this.configLoader.load();
    if (defaultRegistry === undefined) {
      return null; // resolution from a default registry disabled
    }
    try {
      const res = await fetch(`${defaultRegistry}/${name.replace('/', '%2F')}`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) {
        return null; // the registry doesn't host this plugin → fall through to npm
      }
      const packument = RegistryPackumentSchema.parse(await res.json());
      const versions = packument.versions ?? {};
      const target = resolvePackumentVersion(versions, packument['dist-tags'] ?? {}, version);
      const dist = target ? versions[target]?.dist : undefined;
      if (!target || !dist?.tarball) {
        // The registry does not serve this exact pin/range → fall through to npm (the pin may exist
        // there) rather than silently installing a different version.
        return null;
      }
      return { tarball: dist.tarball, integrity: dist.integrity, version: target };
    } catch {
      return null; // unreachable / offline / malformed packument → fall through to npm
    }
  }

  /**
   * Download a resolved plugin tarball and verify it against the registry's `dist.integrity`
   * (Subresource Integrity, e.g. `sha512-<base64>`), caching it to a `file:`-installable path. This
   * restores the metadata→bytes binding a bare `bun install name@<url>` lacks (bun would accept whatever
   * bytes the URL returns and hash after the fact). Throws on a non-https URL, a download failure, or an
   * integrity mismatch. Returns the absolute cache path to install from.
   */
  async #downloadVerifiedTarball(resolved: ResolvedTarball, name: string): Promise<string> {
    const url = new URL(resolved.tarball); // throws on a malformed URL
    if (url.protocol !== 'https:') {
      throw errors.unavailable({
        message: `Refusing to download "${name}" from a non-https tarball URL (${resolved.tarball}).`,
      });
    }
    const res = await fetch(resolved.tarball, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      throw errors.unavailable({
        message: `Could not download "${name}" from ${url.host} (HTTP ${res.status}).`,
      });
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    this.#verifyIntegrity(bytes, resolved.integrity, name, url.host);

    // Bun.write creates the parent directory automatically, so no mkdir is needed.
    const file = join(
      this.pluginsDir,
      '.cache',
      'tarballs',
      `${name.replace('/', '+')}-${resolved.version}.tgz`
    );
    await Bun.write(file, bytes);
    return file;
  }

  /**
   * Verify downloaded bytes against a Subresource-Integrity hash (`sha512-<base64>`). A missing hash
   * means a registry that does not publish integrity: we still install the exact bytes we downloaded
   * (no TLS→bytes gap), only without the cryptographic check, so warn rather than block. Throws on an
   * unsupported algorithm or a real mismatch (a tampered/corrupt tarball).
   */
  #verifyIntegrity(
    bytes: Uint8Array,
    integrity: string | undefined,
    name: string,
    host: string
  ): void {
    if (!integrity) {
      this.logs.warn('Registry tarball has no dist.integrity; installing unverified bytes', {
        pluginName: name,
        host,
      });
      return;
    }
    const dash = integrity.indexOf('-');
    const algorithm = dash > 0 ? integrity.slice(0, dash) : '';
    const expected = dash > 0 ? integrity.slice(dash + 1) : '';
    if (algorithm !== 'sha512' || !expected) {
      throw errors.unavailable({
        message: `Unsupported integrity "${integrity}" for "${name}" (expected sha512-<base64>).`,
      });
    }
    const actual = createHash('sha512').update(bytes).digest('base64');
    if (actual !== expected) {
      throw errors.unavailable({
        message: `Integrity check failed for "${name}" from ${host}: the downloaded tarball does not match the registry's published hash.`,
      });
    }
  }

  /** Best-effort connectivity check: false only on a classified network failure. */
  async #online(): Promise<boolean> {
    try {
      await fetch('https://registry.npmjs.org/', {
        method: 'HEAD',
        signal: AbortSignal.timeout(2500),
      });
      return true;
    } catch (error) {
      // Unknown (non-network) errors must NOT be misread as offline.
      return classifyNetworkError(error) === null;
    }
  }

  async #loadPlugin(name: string, defaultEnabled?: boolean): Promise<void> {
    const { PluginManager } = await import('@/runtime/plugins/plugin-manager');
    const pm = inject(PluginManager);
    // All plugins (npm + workspace) are in pluginsDir/node_modules/. Force the reload: an explicit
    // install/update should recompile and run the freshly-linked code (and show its build trace) even
    // when the plugin is already loaded, e.g. a workspace plugin auto-loaded at boot.
    await pm.load(name, this.pluginsDir, { defaultEnabled, force: true });
  }

  /**
   * Link a local plugin: validate, install dependencies in its source directory,
   * and create a symlink in pluginsDir/node_modules/.
   * Returns the resolved absolute root directory of the plugin.
   */
  async #linkLocalPlugin(name: string, version: string): Promise<string> {
    const { rootDirectory } = await this.configLoader.resolvePluginEntry({ name, version });

    // Validate the target directory contains a package.json
    if (!(await Bun.file(join(rootDirectory, 'package.json')).exists())) {
      throw new Error(`No package.json found at "${rootDirectory}"`);
    }

    // Install dependencies in the plugin's source directory.
    // For monorepo workspace plugins this is a no-op (already installed).
    // For standalone plugins this installs missing deps.
    await this.#installDepsInSource(name, rootDirectory);

    // Create symlink: pluginsDir/node_modules/<name> → rootDirectory
    await this.#ensureSymlink(name, rootDirectory);

    // Deliberately NOT recorded in pluginsDir/package.json: a `workspace:*` / `file:` entry in this
    // non-workspace manifest breaks every later `bun install` (it tries to resolve it as a workspace
    // member). The symlink above plus the brika.yml entry are the source of truth for local plugins.
    return rootDirectory;
  }

  async #installDepsInSource(name: string, rootDirectory: string): Promise<void> {
    let code: number;
    try {
      code = await this.bunRunner.spawn(['install', '--frozen-lockfile'], {
        cwd: rootDirectory,
        stdout: 'ignore',
        stderr: 'ignore',
      }).exited;
    } catch (error) {
      // The spawn itself could not run (bun missing, etc.). A workspace member's
      // deps live at the workspace root, so tolerate it; otherwise it is fatal.
      if (await this.#isWorkspaceMember(rootDirectory)) {
        this.logs.warn(
          'Dependency install could not run; plugin is a workspace member, continuing',
          { pluginName: name },
          { error }
        );
        return;
      }
      throw errors.pluginDepsInstallFailed(
        { pluginName: name, directory: rootDirectory, exitCode: -1 },
        { cause: error }
      );
    }
    if (code === 0) {
      return;
    }
    // A workspace member's dependencies are already installed at the workspace
    // root, so a frozen-lockfile non-zero here is expected and safe to ignore.
    // A standalone plugin with a stale/broken lockfile, though, would crash at
    // load: surface it as a real, actionable error instead of warn-and-continue.
    if (await this.#isWorkspaceMember(rootDirectory)) {
      this.logs.warn(
        'Frozen-lockfile install returned non-zero for a workspace member; continuing',
        { pluginName: name, exitCode: code }
      );
      return;
    }
    throw errors.pluginDepsInstallFailed({
      pluginName: name,
      directory: rootDirectory,
      exitCode: code,
    });
  }

  /**
   * True when `dir` is a member of a bun/npm/yarn workspace: walk up for a
   * parent package.json whose `workspaces` globs actually MATCH `dir` (not
   * merely "a parent has a workspaces key", which would misclassify an
   * unrelated monorepo plugin). Capped at 12 levels.
   */
  async #isWorkspaceMember(dir: string): Promise<boolean> {
    let current = dirname(dir);
    for (let i = 0; i < 12; i += 1) {
      const pkgPath = join(current, 'package.json');
      if (await Bun.file(pkgPath).exists()) {
        const globs = await this.#workspaceGlobs(pkgPath);
        if (globs && this.#dirMatchesWorkspaceGlobs(current, dir, globs)) {
          return true;
        }
      }
      const parent = dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
    return false;
  }

  /** Read a package.json's `workspaces` globs, or null if it has none. */
  async #workspaceGlobs(pkgPath: string): Promise<string[] | null> {
    try {
      const pkg = await Bun.file(pkgPath).json();
      const parsed = WorkspacesSchema.safeParse(pkg.workspaces);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  /** True when `dir`, relative to the workspace root, matches any workspace glob. */
  #dirMatchesWorkspaceGlobs(root: string, dir: string, globs: readonly string[]): boolean {
    const rel = relative(root, dir);
    if (rel.startsWith('..')) {
      return false;
    }
    return globs.some((glob) => new Bun.Glob(glob).match(rel));
  }

  async #ensureSymlink(name: string, rootDirectory: string): Promise<void> {
    const linkPath = join(this.pluginsDir, 'node_modules', name);
    const nodeModulesDir = join(this.pluginsDir, 'node_modules');

    // Guard against path traversal (e.g. name = "../../../etc")
    if (!resolve(linkPath).startsWith(`${resolve(nodeModulesDir)}/`)) {
      throw new Error(`Invalid plugin name: "${name}" resolves outside node_modules`);
    }

    await mkdir(dirname(linkPath), { recursive: true });

    // Update or create symlink (remove stale if target changed)
    try {
      const existing = await readlink(linkPath);
      if (existing !== rootDirectory) {
        await unlink(linkPath);
        await symlink(rootDirectory, linkPath);
      }
    } catch {
      await symlink(rootDirectory, linkPath);
    }
  }

  /**
   * Serialize every read-modify-write of pluginsDir/package.json. Two concurrent
   * installs would otherwise each read the file, add their own dependency, and
   * write back, losing one entry (a lost-update race). The chain runs the next
   * mutation regardless of whether the previous one resolved or rejected.
   */
  #pkgMutation: Promise<unknown> = Promise.resolve();

  #withPkgLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.#pkgMutation.then(fn, fn);
    this.#pkgMutation = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  /** Write package.json atomically (temp file + rename) so a failed write never
   * leaves a truncated/partial manifest behind. */
  async #writePackageJson(pkg: unknown): Promise<void> {
    const pkgPath = join(this.pluginsDir, 'package.json');
    const tmpPath = `${pkgPath}.tmp`;
    await Bun.write(tmpPath, JSON.stringify(pkg, null, 2));
    await rename(tmpPath, pkgPath);
  }

  /**
   * Drop manually-symlinked local plugins (`workspace:*` / `file:` DIRECTORY specifiers) from the
   * install manifest. pluginsDir is not a bun workspace, so such an entry makes `bun install` abort with
   * "Workspace dependency … not found"; local plugins live as symlinks + brika.yml entries instead. A
   * verified registry `.tgz` installed by `file:` is kept (bun manages it like any dependency).
   */
  #pruneLocalManifestDeps(): Promise<void> {
    return this.#withPkgLock(async () => {
      const pkgPath = join(this.pluginsDir, 'package.json');
      const pkg = await Bun.file(pkgPath).json();
      if (!pkg.dependencies) {
        return;
      }
      const kept = Object.fromEntries(
        Object.entries(pkg.dependencies).filter(
          ([, version]) => !(typeof version === 'string' && isLocalPluginSpec(version))
        )
      );
      if (Object.keys(kept).length !== Object.keys(pkg.dependencies).length) {
        pkg.dependencies = kept;
        await this.#writePackageJson(pkg);
        this.logs.info('Pruned local plugin entries from the install manifest', {
          directory: this.pluginsDir,
        });
      }
    });
  }

  #removeDependency(name: string): Promise<void> {
    return this.#withPkgLock(async () => {
      const pkgPath = join(this.pluginsDir, 'package.json');
      const pkg = await Bun.file(pkgPath).json();
      if (pkg.dependencies) {
        delete pkg.dependencies[name];
        await this.#writePackageJson(pkg);
      }
    });
  }

  async #unloadPlugin(name: string): Promise<void> {
    try {
      const { PluginManager } = await import('@/runtime/plugins/plugin-manager');
      const pm = inject(PluginManager);
      await pm.remove(name);
    } catch {
      // Ignore unload errors
    }
  }

  async #listNpm(): Promise<InstalledPackage[]> {
    const pkgPath = join(this.pluginsDir, 'package.json');
    if (!(await Bun.file(pkgPath).exists())) {
      return [];
    }

    const pkg = await Bun.file(pkgPath).json();
    const packages: InstalledPackage[] = [];

    for (const name of Object.keys(pkg.dependencies ?? {})) {
      const version = await this.#getVersion(name);
      if (version) {
        packages.push({
          name,
          version,
          path: join(this.pluginsDir, 'node_modules', name),
        });
      }
    }

    return packages;
  }

  async #getVersion(name: string): Promise<string | null> {
    try {
      const pkgPath = join(this.pluginsDir, 'node_modules', name, 'package.json');
      const pkg = await Bun.file(pkgPath).json();
      return pkg.version;
    } catch {
      return null;
    }
  }

  async #getLatestVersion(name: string): Promise<string | null> {
    // A registry/tarball plugin's latest lives in the registry packument: `npm view` would query public
    // npm, which may not host it at all (or host a divergent version) → a wrong "update available".
    if (isRegistrySpec(await this.#installedSpec(name))) {
      return (await this.#resolveRegistryTarball(name))?.version ?? null;
    }
    try {
      const proc = Bun.spawn(['npm', 'view', name, 'version'], {
        cwd: this.pluginsDir,
        stdout: 'pipe',
      });
      const version = (await new Response(proc.stdout).text()).trim();
      await proc.exited;
      return version || null;
    } catch {
      return null;
    }
  }

  #msg(
    phase: OperationProgress['phase'],
    operation: OperationProgress['operation'],
    packageName: string,
    version?: string,
    message?: string,
    error?: string
  ): OperationProgress {
    // Only append `@version` when a version is known: an update (or a `latest` install) carries none,
    // so the default message must not read "…@undefined".
    const versionSuffix = version ? `@${version}` : '';
    return {
      phase,
      operation,
      package: packageName,
      targetVersion: version,
      message: message ?? `${phase} ${packageName}${versionSuffix}`,
      error,
    };
  }

  /** Build an `error` progress event, carrying a typed BrikaError's code/detail when present. */
  #errorMsg(
    operation: OperationProgress['operation'],
    packageName: string,
    version: string | undefined,
    error: unknown
  ): OperationProgress {
    const fields = errorFields(error);
    return {
      phase: 'error',
      operation,
      package: packageName,
      targetVersion: version,
      message: fields.error,
      ...fields,
    };
  }
}
