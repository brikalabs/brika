import { mkdir, readlink, symlink, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { inject, singleton } from '@brika/di';
import { BunRunner, ConfigLoader, HubConfig } from '@/runtime/config';
import { Logger } from '@/runtime/logs/log-router';
import { PackageManager } from './package-manager';
import type { InstalledPackage, OperationProgress, UpdateInfo } from './types';

function normalizeVersion(version?: string): string | undefined {
  // Bare absolute paths → file: specifier
  if (version?.startsWith('/')) return `file:${version}`;
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

    try {
      yield this.#msg('resolving', 'install', name, version);

      let rootDirectory: string | undefined;
      if (isLocalVersion(version)) {
        rootDirectory = await this.#linkLocalPlugin(name, version);
      } else {
        yield* this.#pm.install(name, version);
      }

      await this.configLoader.addPlugin(name, version ?? 'latest');

      yield this.#msg('linking', 'install', name, version, 'Loading plugin...');
      await this.#loadPlugin(rootDirectory ?? name);

      yield this.#msg('complete', 'install', name, version, 'Installed successfully');
    } catch (error) {
      yield this.#msg('error', 'install', name, version, String(error), String(error));
    }
  }

  async uninstall(name: string): Promise<void> {
    await this.#unloadPlugin(name);
    await this.configLoader.removePlugin(name);

    const linkPath = join(this.pluginsDir, 'node_modules', name);
    const isSymlink = await readlink(linkPath).then(() => true, () => false);

    if (isSymlink) {
      // Workspace plugin — remove symlink and package.json entry
      await unlink(linkPath).catch(() => undefined);
      await this.#removeDependency(name);
    } else if (await Bun.file(join(linkPath, 'package.json')).exists()) {
      // NPM plugin — use package manager
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
      yield this.#msg('error', 'update', name ?? 'all', undefined, String(error), String(error));
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

  async #removeStalePlugins(installed: InstalledPackage[], configNames: Set<string>): Promise<void> {
    for (const pkg of installed) {
      if (configNames.has(pkg.name)) continue;
      try {
        await this.uninstall(pkg.name);
      } catch (error) {
        this.logs.error('Failed to uninstall plugin during sync', { packageName: pkg.name }, { error });
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
          this.logs.error('Failed to install plugin during sync', { packageName: entry.name }, { error });
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  async #loadPlugin(name: string): Promise<void> {
    const { PluginManager } = await import('@/runtime/plugins/plugin-manager');
    const pm = inject(PluginManager);
    // All plugins (npm + workspace) are in pluginsDir/node_modules/
    await pm.load(name, this.pluginsDir);
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
    try {
      const code = await this.bunRunner
        .spawn(['install', '--frozen-lockfile'], { cwd: rootDirectory, stdout: 'ignore', stderr: 'ignore' })
        .exited;
      if (code !== 0) {
        this.logs.warn('Dependency install returned non-zero exit code, plugin may still work if part of a workspace', {
          pluginName: name,
          exitCode: code,
        });
      }
    } catch (error) {
      this.logs.warn('Failed to install plugin dependencies', { pluginName: name }, { error });
    }
  }

  async #ensureSymlink(name: string, rootDirectory: string): Promise<void> {
    const linkPath = join(this.pluginsDir, 'node_modules', name);
    const nodeModulesDir = join(this.pluginsDir, 'node_modules');

    // Guard against path traversal (e.g. name = "../../../etc")
    if (!resolve(linkPath).startsWith(resolve(nodeModulesDir) + '/')) {
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

  async #addDependency(name: string, version: string): Promise<void> {
    const pkgPath = join(this.pluginsDir, 'package.json');
    const pkg = await Bun.file(pkgPath).json();
    pkg.dependencies ??= {};
    pkg.dependencies[name] = version;
    await Bun.write(pkgPath, JSON.stringify(pkg, null, 2));
  }

  async #removeDependency(name: string): Promise<void> {
    const pkgPath = join(this.pluginsDir, 'package.json');
    const pkg = await Bun.file(pkgPath).json();
    if (pkg.dependencies) {
      delete pkg.dependencies[name];
      await Bun.write(pkgPath, JSON.stringify(pkg, null, 2));
    }
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
}
