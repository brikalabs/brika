import { mkdir, readlink, rename, symlink, unlink } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { inject, singleton } from '@brika/di';
import { errors } from '@brika/errors';
import { z } from 'zod';
import { BunRunner, ConfigLoader, HubConfig } from '@/runtime/config';
import { Logger } from '@/runtime/logs/log-router';
import { StateStore } from '@/runtime/state/state-store';
import { PackageManager } from './package-manager';
import { errorFields } from './progress';
import type { InstalledPackage, OperationProgress, UpdateInfo } from './types';

/** A package.json `workspaces` field: a glob array, or `{ packages: [...] }`. */
const WorkspacesSchema = z.union([
  z.array(z.string()),
  z.object({ packages: z.array(z.string()) }).transform((o) => o.packages),
]);

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
    // Use absolute path for Bun.resolveSync compatibility
    this.pluginsDir = resolve(this.hubConfig.homeDir, 'plugins');
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
        yield* this.#pm.install(name, version);
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
      await this.configLoader.addPlugin(name, version ?? 'latest');

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
      yield* this.#pm.update(name);
      yield this.#msg('complete', 'update', name ?? 'all', undefined, 'Updated successfully');
    } catch (error) {
      yield this.#errorMsg('update', name ?? 'all', undefined, error);
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
          updateAvailable: current !== latest,
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

  async #loadPlugin(name: string, defaultEnabled?: boolean): Promise<void> {
    const { PluginManager } = await import('@/runtime/plugins/plugin-manager');
    const pm = inject(PluginManager);
    // All plugins (npm + workspace) are in pluginsDir/node_modules/
    await pm.load(name, this.pluginsDir, { defaultEnabled });
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

    await this.#addDependency(name, version);
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

  #addDependency(name: string, version: string): Promise<void> {
    return this.#withPkgLock(async () => {
      const pkgPath = join(this.pluginsDir, 'package.json');
      const pkg = await Bun.file(pkgPath).json();
      pkg.dependencies ??= {};
      pkg.dependencies[name] = version;
      await this.#writePackageJson(pkg);
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
    return {
      phase,
      operation,
      package: packageName,
      targetVersion: version,
      message: message ?? `${phase} ${packageName}@${version}`,
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
