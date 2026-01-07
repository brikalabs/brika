import { dirname, extname, join, resolve } from 'node:path';
import { PluginPackageSchema } from '@brika/schema';

/**
 * Load and parse package.json with Zod validation
 */
export async function loadPluginPackageJson(packageJsonPath: string) {
  return PluginPackageSchema.parse(await import(packageJsonPath, { with: { type: 'json' } }));
}

/**
 * Simple plugin resolver using Bun's module resolution.
 * Finds package.json and extracts entry point.
 */
export class PluginResolver {
  /**
   * Resolve plugin: find package.json, validate it, and extract entry point.
   * @param moduleId - Package name or absolute path to plugin directory
   * @param parent - Parent directory for Bun.resolveSync
   */
  async resolve(
    moduleId: string,
    parent?: string
  ): Promise<{
    rootDirectory: string;
    entryPoint: string;
    metadata: PluginPackageSchema;
  }> {
    if (!moduleId) {
      throw new Error('Plugin moduleId is required');
    }

    try {
      // Use Bun's module resolution to find package.json
      const { rootPath, packageJsonPath } = this.#resolvePackageJson(moduleId, parent);

      // Read and validate package.json
      const metadata = await loadPluginPackageJson(packageJsonPath);

      // Extract entry point
      const entryPoint = this.#extractEntryPoint(metadata, rootPath);

      return { rootDirectory: rootPath, entryPoint, metadata };
    } catch (error) {
      throw new Error(`Failed to resolve plugin "${moduleId}": ${error}`);
    }
  }

  #extractEntryPoint(metadata: PluginPackageSchema, rootPath: string): string {
    // main field is required
    if (!metadata.main) {
      throw new Error(`Plugin "${metadata.name}" must have a "main" field in package.json`);
    }

    return resolve(rootPath, metadata.main);
  }

  #resolvePackageJson(
    target: string,
    parent?: string
  ): { rootPath: string; packageJsonPath: string } {
    // If target is already an absolute path to a directory, use it directly
    if (target.startsWith('/')) {
      const packageJsonPath = join(target, 'package.json');
      return { rootPath: target, packageJsonPath };
    }

    // Otherwise use Bun's module resolution
    const base = extname(target) ? dirname(target) : target;
    const packageJsonPath = Bun.resolveSync(join(base, 'package.json'), parent || import.meta.dir);
    return { rootPath: dirname(packageJsonPath), packageJsonPath };
  }
}
