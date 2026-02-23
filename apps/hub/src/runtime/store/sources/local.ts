import { inject, singleton } from '@brika/di';
import { PluginPackageSchema } from '@brika/schema';
import type { PluginPackageData } from '../types';
import { ConfigLoader } from '@/runtime/config/config-loader';
import { Logger } from '@/runtime/logs/log-router';
import type { RawRegistryPlugin, RegistrySource } from './registry-source';

/**
 * Registry source for local workspace plugins.
 * Discovers Brika plugins across all workspace packages defined in the
 * root `package.json` `workspaces` field — no magic strings required.
 */
@singleton()
export class LocalRegistry implements RegistrySource {
  readonly #log = inject(Logger).withSource('registry');
  readonly #configLoader = inject(ConfigLoader);

  async search(
    query?: string,
    _limit?: number,
    _offset?: number
  ): Promise<{ plugins: RawRegistryPlugin[]; total: number }> {
    const workspaceRoot = await this.#configLoader.getWorkspaceRoot();
    const patterns = await this.#getWorkspacePatterns(workspaceRoot);
    const plugins: RawRegistryPlugin[] = [];

    for (const scanDir of this.#scanDirs(workspaceRoot, patterns)) {
      await this.#scanDir(scanDir, query, plugins);
    }

    return { plugins, total: plugins.length };
  }

  /**
   * Find a specific workspace plugin by package name.
   * Returns the root directory and parsed package data, or null if not found.
   * Used for detail view, README and icon serving.
   */
  async findByName(name: string): Promise<{ rootDir: string; pkg: PluginPackageSchema } | null> {
    const workspaceRoot = await this.#configLoader.getWorkspaceRoot();
    const patterns = await this.#getWorkspacePatterns(workspaceRoot);

    for (const scanDir of this.#scanDirs(workspaceRoot, patterns)) {
      try {
        const glob = new Bun.Glob('*/package.json');
        for await (const path of glob.scan({ cwd: scanDir, absolute: false })) {
          try {
            const raw = await Bun.file(`${scanDir}/${path}`).json();
            const parsed = PluginPackageSchema.safeParse(raw);
            if (!parsed.success) continue;
            if (parsed.data.name === name) {
              return {
                rootDir: `${scanDir}/${path.replace('/package.json', '')}`,
                pkg: parsed.data,
              };
            }
          } catch {
            // Skip unreadable package.json
          }
        }
      } catch {
        // Directory does not exist — skip
      }
    }

    return null;
  }

  async #getWorkspacePatterns(workspaceRoot: string): Promise<string[]> {
    try {
      const raw = await Bun.file(`${workspaceRoot}/package.json`).json();
      return Array.isArray(raw.workspaces) ? raw.workspaces : [];
    } catch {
      return [];
    }
  }

  /** Convert workspace glob patterns to absolute scan directories. */
  *#scanDirs(workspaceRoot: string, patterns: string[]): Generator<string> {
    for (const pattern of patterns) {
      // 'plugins/*' → scan workspaceRoot/plugins
      // 'apps/*'    → scan workspaceRoot/apps
      const dir = pattern.endsWith('/*') ? pattern.slice(0, -2) : pattern;
      yield `${workspaceRoot}/${dir}`;
    }
  }

  async #scanDir(
    scanDir: string,
    query: string | undefined,
    out: RawRegistryPlugin[]
  ): Promise<void> {
    try {
      const glob = new Bun.Glob('*/package.json');
      for await (const path of glob.scan({ cwd: scanDir, absolute: false })) {
        try {
          const raw = await Bun.file(`${scanDir}/${path}`).json();
          const parsed = PluginPackageSchema.safeParse(raw);
          if (!parsed.success) continue;

          const pkg = parsed.data;
          if (query && !this.#matchesQuery(pkg, query)) continue;

          out.push({
            package: {
              name: pkg.name,
              version: pkg.version,
              displayName: pkg.displayName,
              description: pkg.description,
              author: pkg.author,
              keywords: pkg.keywords ?? [],
              repository: pkg.repository,
              homepage: pkg.homepage,
              license: pkg.license,
              engines: pkg.engines,
            } as PluginPackageData,
            downloadCount: 0,
            source: 'local',
            installVersion: 'workspace:*',
          });
        } catch {
          // Skip unreadable package.json
        }
      }
    } catch {
      this.#log.debug('Workspace directory not found', { scanDir });
    }
  }

  #matchesQuery(pkg: PluginPackageSchema, query: string): boolean {
    const q = query.toLowerCase();
    return (
      pkg.name.toLowerCase().includes(q) ||
      !!pkg.description?.toLowerCase().includes(q) ||
      !!pkg.keywords?.some((k) => k.toLowerCase().includes(q))
    );
  }
}
