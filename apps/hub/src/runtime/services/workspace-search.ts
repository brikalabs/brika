import { inject, singleton } from '@brika/di';
import { PluginPackageSchema } from '@brika/schema';
import type { NpmPackageData } from '@brika/shared';
import { ConfigLoader } from '@/runtime/config/config-loader';
import { Logger } from '@/runtime/logs/log-router';

export interface LocalPluginResult {
  package: NpmPackageData;
  installed: boolean;
  installedVersion?: string;
}

/**
 * Discovers local workspace plugins by scanning the `plugins/` directory.
 * Results are shaped like npm search results for uniformity with the store UI.
 */
@singleton()
export class WorkspaceSearchService {
  readonly #log = inject(Logger).withSource('registry');
  readonly #configLoader = inject(ConfigLoader);

  /**
   * Scan the workspace `plugins/` directory for valid Brika plugins.
   * Returns an empty array if no workspace root or plugins directory is found.
   */
  async discover(query?: string): Promise<LocalPluginResult[]> {
    const workspaceRoot = await this.#configLoader.getWorkspaceRoot();
    const pluginsDir = `${workspaceRoot}/plugins`;
    const config = this.#configLoader.get();
    const results: LocalPluginResult[] = [];

    try {
      const glob = new Bun.Glob('*/package.json');

      for await (const path of glob.scan({ cwd: pluginsDir, absolute: false })) {
        const pkgPath = `${pluginsDir}/${path}`;
        try {
          const raw = await Bun.file(pkgPath).json();
          const parsed = PluginPackageSchema.safeParse(raw);
          if (!parsed.success) continue;

          const pkg = parsed.data;

          // Filter by query if provided
          if (query && !this.#matchesQuery(pkg, query)) continue;

          const entry = config.plugins.find((p) => p.name === pkg.name);

          results.push({
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
            } as NpmPackageData,
            installed: entry !== undefined,
            installedVersion: entry ? pkg.version : undefined,
          });
        } catch {
          // Skip invalid package.json
        }
      }
    } catch {
      this.#log.debug('No workspace plugins directory found', { pluginsDir });
    }

    return results;
  }

  /**
   * Find a specific local plugin by package name.
   * Returns the root directory and parsed package data, or null if not found.
   */
  async findByName(name: string): Promise<{ rootDir: string; pkg: PluginPackageSchema } | null> {
    const workspaceRoot = await this.#configLoader.getWorkspaceRoot();
    const pluginsDir = `${workspaceRoot}/plugins`;

    try {
      const glob = new Bun.Glob('*/package.json');

      for await (const path of glob.scan({ cwd: pluginsDir, absolute: false })) {
        const pkgPath = `${pluginsDir}/${path}`;
        try {
          const raw = await Bun.file(pkgPath).json();
          const parsed = PluginPackageSchema.safeParse(raw);
          if (!parsed.success) continue;
          if (parsed.data.name === name) {
            const rootDir = `${pluginsDir}/${path.replace('/package.json', '')}`;
            return { rootDir, pkg: parsed.data };
          }
        } catch {
          // Skip invalid package.json
        }
      }
    } catch {
      // No plugins directory
    }

    return null;
  }

  #matchesQuery(pkg: PluginPackageSchema, query: string): boolean {
    const q = query.toLowerCase();
    if (pkg.name.toLowerCase().includes(q)) return true;
    if (pkg.description?.toLowerCase().includes(q)) return true;
    if (pkg.keywords?.some((k) => k.toLowerCase().includes(q))) return true;
    return false;
  }
}
