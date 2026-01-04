import { join } from 'node:path';
import { inject, singleton } from '@brika/shared';
import { ConfigLoader, HubConfig } from '@/runtime/config';
import { LogRouter } from '@/runtime/logs/log-router';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type OperationPhase = 'resolving' | 'downloading' | 'linking' | 'complete' | 'error';
export type OperationType = 'install' | 'update' | 'uninstall';

export interface OperationProgress {
  phase: OperationPhase;
  operation: OperationType;
  package: string;
  currentVersion?: string;
  targetVersion?: string;
  progress?: number; // 0-100
  message: string;
  error?: string;
}

export interface UpdateInfo {
  name: string;
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}

export interface InstalledPackage {
  name: string;
  version: string;
  path: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// PluginRegistry
// ─────────────────────────────────────────────────────────────────────────────

@singleton()
export class PluginRegistry {
  private readonly hubConfig = inject(HubConfig);
  private readonly logs = inject(LogRouter);
  private readonly configLoader = inject(ConfigLoader);

  readonly #pluginsDir: string;

  constructor() {
    this.#pluginsDir = join(this.hubConfig.homeDir, 'plugins');
  }

  get pluginsDir(): string {
    return this.#pluginsDir;
  }

  /**
   * Initialize the plugins directory with package.json if needed.
   */
  async init(): Promise<void> {
    const dir = this.#pluginsDir;
    await Bun.write(Bun.file(join(dir, '.keep')), '');

    const pkgPath = join(dir, 'package.json');
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
      this.logs.info('registry.init', { dir });
    }
  }

  /**
   * Install a package from registry.
   * install("@brika/plugin-timer", "^1.0.0") - uses bun add
   *
   * For local development, use `bun link` manually.
   */
  async *install(packageName: string, version?: string): AsyncGenerator<OperationProgress> {
    const spec = version ? `${packageName}@${version}` : packageName;

    yield {
      phase: 'resolving',
      operation: 'install',
      package: packageName,
      targetVersion: version,
      message: `Resolving ${spec}...`,
    };

    this.logs.info('registry.install.start', { spec });

    const proc = Bun.spawn(['bun', 'install', spec], {
      cwd: this.#pluginsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    // Stream output and parse progress
    yield* this.#streamOutput(proc, 'install', packageName);

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const error = `Install failed with exit code ${exitCode}`;
      this.logs.error('registry.install.failed', { spec, exitCode });
      yield {
        phase: 'error',
        operation: 'install',
        package: packageName,
        message: error,
        error,
      };
      return;
    }

    this.logs.info('registry.install.done', { spec });
    yield {
      phase: 'complete',
      operation: 'install',
      package: packageName,
      message: `Successfully installed ${spec}`,
    };
  }

  /**
   * Update a single package or all packages.
   * If packageName is omitted, updates all packages.
   */
  async *update(packageName?: string): AsyncGenerator<OperationProgress> {
    const target = packageName ?? 'all packages';

    yield {
      phase: 'resolving',
      operation: 'update',
      package: packageName ?? 'all',
      message: `Checking updates for ${target}...`,
    };

    this.logs.info('registry.update.start', { package: packageName ?? 'all' });

    const args = packageName ? ['bun', 'update', packageName] : ['bun', 'update'];

    const proc = Bun.spawn(args, {
      cwd: this.#pluginsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    yield* this.#streamOutput(proc, 'update', packageName ?? 'all');

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const error = `Update failed with exit code ${exitCode}`;
      this.logs.error('registry.update.failed', { package: packageName ?? 'all', exitCode });
      yield {
        phase: 'error',
        operation: 'update',
        package: packageName ?? 'all',
        message: error,
        error,
      };
      return;
    }

    this.logs.info('registry.update.done', { package: packageName ?? 'all' });
    yield {
      phase: 'complete',
      operation: 'update',
      package: packageName ?? 'all',
      message: `Successfully updated ${target}`,
    };
  }

  /**
   * Check for available updates.
   */
  async checkUpdates(): Promise<UpdateInfo[]> {
    const pkgPath = join(this.#pluginsDir, 'package.json');
    const pkgFile = Bun.file(pkgPath);
    if (!(await pkgFile.exists())) return [];

    const pkg = await pkgFile.json();
    const deps = (pkg.dependencies ?? {}) as Record<string, string>;

    const updates: UpdateInfo[] = [];

    for (const name of Object.keys(deps)) {
      try {
        // Get current installed version from node_modules
        const installedPkgPath = join(this.#pluginsDir, 'node_modules', name, 'package.json');
        const installedPkgFile = Bun.file(installedPkgPath);
        if (!(await installedPkgFile.exists())) continue;

        const installedPkg = await installedPkgFile.json();
        const currentVersion = installedPkg.version;

        // Get latest version from npm registry
        const proc = Bun.spawn(['npm', 'view', name, 'version'], {
          cwd: this.#pluginsDir,
          stdout: 'pipe',
          stderr: 'pipe',
        });

        const output = (await new Response(proc.stdout).text()).trim();
        await proc.exited;

        if (output) {
          updates.push({
            name,
            currentVersion,
            latestVersion: output,
            updateAvailable: currentVersion !== output,
          });
        }
      } catch {
        this.logs.warn('registry.checkUpdates.failed', { name });
      }
    }

    return updates;
  }

  /**
   * Uninstall a package.
   */
  async uninstall(packageName: string): Promise<void> {
    this.logs.info('registry.uninstall.start', { package: packageName });

    const proc = Bun.spawn(['bun', 'remove', packageName], {
      cwd: this.#pluginsDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    // Consume output
    await this.#consumeOutput(proc);

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      this.logs.error('registry.uninstall.failed', { package: packageName, exitCode });
      throw new Error(`Uninstall failed with exit code ${exitCode}`);
    }

    this.logs.info('registry.uninstall.done', { package: packageName });
  }

  /**
   * List all installed packages.
   */
  async list(): Promise<InstalledPackage[]> {
    const pkgPath = join(this.#pluginsDir, 'package.json');
    const pkgFile = Bun.file(pkgPath);
    if (!(await pkgFile.exists())) return [];

    const pkg = await pkgFile.json();
    const deps = (pkg.dependencies ?? {}) as Record<string, string>;

    const packages: InstalledPackage[] = [];

    for (const name of Object.keys(deps)) {
      try {
        const pkgJsonPath = join(this.#pluginsDir, 'node_modules', name, 'package.json');
        const installedPkgFile = Bun.file(pkgJsonPath);
        if (!(await installedPkgFile.exists())) continue;

        const installedPkg = await installedPkgFile.json();

        packages.push({
          name,
          version: installedPkg.version,
          path: join(this.#pluginsDir, 'node_modules', name),
        });
      } catch {
        this.logs.warn('registry.list.readFailed', { name });
      }
    }

    return packages;
  }

  /**
   * Check if a package is installed.
   */
  async has(packageName: string): Promise<boolean> {
    const pkgPath = join(this.#pluginsDir, 'package.json');
    const pkgFile = Bun.file(pkgPath);
    if (!(await pkgFile.exists())) return false;

    const pkg = await pkgFile.json();
    return packageName in (pkg.dependencies ?? {});
  }

  /**
   * Get information about an installed package.
   */
  async get(packageName: string): Promise<InstalledPackage | null> {
    const packages = await this.list();
    return packages.find((p) => p.name === packageName) ?? null;
  }

  /**
   * Resolve a package's entry point.
   * Returns the resolved path or null if not found.
   */
  resolve(packageName: string): string | null {
    try {
      return Bun.resolveSync(packageName, this.#pluginsDir);
    } catch {
      return null;
    }
  }

  /**
   * Stream output from a bun process and yield progress events.
   */
  async *#streamOutput(
    proc: ReturnType<typeof Bun.spawn>,
    operation: OperationType,
    packageName: string
  ): AsyncGenerator<OperationProgress> {
    const decoder = new TextDecoder();
    let phase: OperationPhase = 'resolving';

    const parseAndYield = (line: string): OperationProgress | null => {
      const trimmed = line.trim();
      if (!trimmed) return null;

      // Log the line
      this.logs.emit({
        ts: Date.now(),
        level: 'info',
        source: 'registry',
        message: operation,
        meta: { line: trimmed },
      });

      // Parse bun output to determine phase
      if (trimmed.includes('resolving')) {
        phase = 'resolving';
      } else if (trimmed.includes('downloading') || trimmed.includes('GET')) {
        phase = 'downloading';
      } else if (trimmed.includes('linking') || trimmed.includes('installed')) {
        phase = 'linking';
      }

      return {
        phase,
        operation,
        package: packageName,
        message: trimmed,
      };
    };

    // Read stdout
    if (proc.stdout) {
      const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          for (const line of text.split('\n')) {
            const progress = parseAndYield(line);
            if (progress) yield progress;
          }
        }
      } finally {
        reader.releaseLock();
      }
    }

    // Read stderr
    if (proc.stderr) {
      const reader = (proc.stderr as ReadableStream<Uint8Array>).getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          for (const line of text.split('\n')) {
            const progress = parseAndYield(line);
            if (progress) yield progress;
          }
        }
      } finally {
        reader.releaseLock();
      }
    }
  }

  /**
   * Consume output from a process without yielding (for simple operations).
   */
  async #consumeOutput(proc: ReturnType<typeof Bun.spawn>): Promise<void> {
    const consume = async (stream: ReadableStream<Uint8Array> | null) => {
      if (!stream) return;
      const reader = stream.getReader();
      try {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      } finally {
        reader.releaseLock();
      }
    };

    await Promise.all([
      consume(proc.stdout as ReadableStream<Uint8Array> | null),
      consume(proc.stderr as ReadableStream<Uint8Array> | null),
    ]);
  }

  /**
   * Sync installed packages to match the config entries.
   * - Uninstall packages not in config
   * - Install missing packages from config
   *
   * Note: workspace: and file: specifiers are skipped (they don't need registry installation)
   */
  async syncToConfig(entries: Array<{ name: string; specifier: string }>): Promise<void> {
    const configNames = new Set(entries.map((e) => e.name));
    const installed = await this.list();

    // Uninstall packages not in config
    for (const pkg of installed) {
      if (!configNames.has(pkg.name)) {
        this.logs.info('registry.sync.uninstall', { name: pkg.name });
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

    // Install missing packages (only npm/git packages, skip workspace: and file:)
    for (const entry of entries) {
      // Skip workspace: and file: packages - they don't need registry installation
      if (entry.specifier.startsWith('workspace:') || entry.specifier.startsWith('file:')) {
        this.logs.info('registry.sync.skip', {
          name: entry.name,
          specifier: entry.specifier,
          reason: 'workspace/file packages loaded directly',
        });
        continue;
      }

      if (!(await this.has(entry.name))) {
        this.logs.info('registry.sync.install', {
          name: entry.name,
          specifier: entry.specifier,
        });
        try {
          // Consume the async generator to complete installation
          for await (const progress of this.install(entry.name, entry.specifier)) {
            if (progress.phase === 'error') {
              throw new Error(progress.error ?? 'Installation failed');
            }
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
}
