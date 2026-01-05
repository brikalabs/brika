import { join } from 'node:path';
import { inject, singleton } from '@brika/shared';
import { ConfigLoader, HubConfig } from '@/runtime/config';
import { LogRouter } from '@/runtime/logs/log-router';
import type { InstalledPackage, OperationProgress, UpdateInfo } from './types';

@singleton()
export class PluginRegistry {
  private readonly hubConfig = inject(HubConfig);
  private readonly logs = inject(LogRouter);
  private readonly configLoader = inject(ConfigLoader);
  private readonly pluginsDir: string;

  constructor() {
    this.pluginsDir = join(this.hubConfig.homeDir, 'plugins');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    const pkgPath = join(this.pluginsDir, 'package.json');
    if (!(await Bun.file(pkgPath).exists())) {
      await Bun.write(
        pkgPath,
        JSON.stringify({ name: 'brika-plugins', private: true, dependencies: {} }, null, 2)
      );
      this.logs.info('registry.init', { dir: this.pluginsDir });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Install / Uninstall
  // ─────────────────────────────────────────────────────────────────────────────

  async *install(name: string, version?: string): AsyncGenerator<OperationProgress> {
    const isWorkspace = version?.startsWith('workspace:') || version?.startsWith('file:');

    try {
      yield this.#msg('resolving', 'install', name, version);

      // Install package (npm or workspace)
      if (!isWorkspace) {
        const spec = version ? `${name}@${version}` : name;
        yield* this.#runBunWithProgress('install', name, ['install', spec]);
      }

      // Add to config for persistence
      await this.configLoader.addPlugin(name, version ?? 'latest');

      // Load plugin
      yield this.#msg('linking', 'install', name, version, 'Loading plugin...');
      await this.#loadPlugin(name, !!isWorkspace);

      yield this.#msg('complete', 'install', name, version, 'Installed successfully');
    } catch (error) {
      yield this.#msg('error', 'install', name, version, String(error), String(error));
    }
  }

  async uninstall(name: string): Promise<void> {
    // Unload plugin
    await this.#unloadPlugin(name);

    // Remove from config
    await this.configLoader.removePlugin(name);

    // Remove from npm if exists
    const npmPath = join(this.pluginsDir, 'node_modules', name, 'package.json');
    if (await Bun.file(npmPath).exists()) {
      await this.#runBun(['remove', name]);
    }

    this.logs.info('registry.uninstall.done', { package: name });
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
    for (const entry of config.install) {
      if (!packages.some((p) => p.name === entry.name)) {
        packages.push({
          name: entry.name,
          version: entry.specifier,
          path: entry.specifier.startsWith('workspace:') ? 'workspace' : entry.specifier,
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
      const args = name ? ['update', name] : ['update'];
      // Run bun update and stream progress
      for await (const progress of this.#runBunWithProgress('update', name ?? 'all', args)) {
        yield progress;
      }
      yield this.#msg('complete', 'update', name ?? 'all', undefined, 'Updated successfully');
    } catch (error) {
      yield this.#msg('error', 'update', name ?? 'all', undefined, String(error), String(error));
    }
  }

  async checkUpdates(): Promise<UpdateInfo[]> {
    const pkgPath = join(this.pluginsDir, 'package.json');
    if (!(await Bun.file(pkgPath).exists())) return [];

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

  async syncToConfig(entries: Array<{ name: string; specifier: string }>): Promise<void> {
    const configNames = new Set(entries.map((e) => e.name));
    const installed = await this.list();

    // Uninstall removed
    for (const pkg of installed) {
      if (!configNames.has(pkg.name)) {
        try {
          await this.uninstall(pkg.name);
        } catch (error) {
          this.logs.error('registry.sync.uninstall.failed', {
            name: pkg.name,
            error: String(error),
          });
        }
      }
    }

    // Install missing
    for (const entry of entries) {
      if (!(await this.has(entry.name))) {
        try {
          for await (const _ of this.install(entry.name, entry.specifier)) {
            // Consume progress
          }
        } catch (error) {
          this.logs.error('registry.sync.install.failed', {
            name: entry.name,
            error: String(error),
          });
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  async #runBun(args: string[]): Promise<void> {
    const proc = Bun.spawn(['bun', ...args], {
      cwd: this.pluginsDir,
      stdout: 'ignore',
      stderr: 'ignore',
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new Error(`Command failed: bun ${args.join(' ')}`);
    }
  }

  async *#runBunWithProgress(
    operation: OperationProgress['operation'],
    packageName: string,
    args: string[]
  ): AsyncGenerator<OperationProgress> {
    const proc = Bun.spawn(['bun', ...args], {
      cwd: this.pluginsDir,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        BUN_INSTALL_CACHE_DIR: join(this.pluginsDir, '.cache'),
      },
    });

    // Stream stderr output line by line
    if (proc.stderr) {
      yield* this.#streamBunOutput(proc.stderr, operation, packageName);
    }

    // Check exit code
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new Error(`Command failed with exit code ${exitCode}`);
    }
  }

  async *#streamBunOutput(
    stderr: ReadableStream,
    operation: OperationProgress['operation'],
    packageName: string
  ): AsyncGenerator<OperationProgress> {
    const reader = (stderr as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let phase: OperationProgress['phase'] = 'downloading';

    try {
      while (true) {
        const { value, done } = await reader.read();

        if (value) {
          buffer = this.#appendToBuffer(buffer, decoder, value);
          const { lines, remaining } = this.#extractLines(buffer);
          buffer = remaining;

          // Process and yield each line
          for (const line of lines) {
            if (!line) continue;

            this.logs.info('registry.bun', { line });
            phase = this.#detectPhase(line);
            yield this.#msg(phase, operation, packageName, undefined, line);
          }
        }

        if (done) {
          // Yield any remaining buffer
          if (buffer.trim()) {
            yield this.#msg(phase, operation, packageName, undefined, buffer.trim());
          }
          break;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  #appendToBuffer(buffer: string, decoder: TextDecoder, value: Uint8Array): string {
    return buffer + decoder.decode(value, { stream: true });
  }

  #extractLines(buffer: string): { lines: string[]; remaining: string } {
    const lines = buffer.split('\n');
    const remaining = lines.pop() || '';
    return { lines: lines.map((l) => l.trim()), remaining };
  }

  #detectPhase(line: string): OperationProgress['phase'] {
    if (line.includes('resolving') || line.includes('Resolving')) {
      return 'resolving';
    }
    if (line.includes('downloading') || line.includes('GET') || line.includes('fetch')) {
      return 'downloading';
    }
    if (line.includes('linking') || line.includes('installed') || line.includes('Saved')) {
      return 'linking';
    }
    return 'downloading';
  }

  async #loadPlugin(name: string, isWorkspace: boolean): Promise<void> {
    const { PluginManager } = await import('@/runtime/plugins/plugin-manager');
    const pm = inject(PluginManager);

    if (isWorkspace) {
      const config = await this.configLoader.load();
      const entry = config.install.find((e) => e.name === name);
      if (!entry) throw new Error('Plugin not found in config');

      const resolved = await this.configLoader.resolvePluginEntry(entry);
      await pm.load(resolved.rootDirectory);
    } else {
      await pm.load(name);
    }
  }

  async #unloadPlugin(name: string): Promise<void> {
    try {
      const { PluginManager } = await import('@/runtime/plugins/plugin-manager');
      const pm = inject(PluginManager);
      const plugin = pm.list().find((p) => p.name === name);
      if (plugin) await pm.unload(plugin.name);
    } catch {
      // Ignore unload errors
    }
  }

  async #listNpm(): Promise<InstalledPackage[]> {
    const pkgPath = join(this.pluginsDir, 'package.json');
    if (!(await Bun.file(pkgPath).exists())) return [];

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
