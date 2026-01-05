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
   */
  async resolve(
    nameOrPath: string,
    fromDir?: string
  ): Promise<{
    rootDirectory: string;
    entryPoint: string;
    metadata: PluginPackageSchema;
  }> {
    if (!nameOrPath) {
      throw new Error('Plugin name/path is required');
    }

    try {
      // Use Bun's module resolution to find package.json
      const { rootPath, packageJsonPath } = this.#resolvePackageJson(nameOrPath, fromDir);

      // Read and validate package.json
      const metadata = await loadPluginPackageJson(packageJsonPath);

      // Extract entry point
      const entryPoint = this.#extractEntryPoint(metadata, rootPath);

      return { rootDirectory: rootPath, entryPoint, metadata };
    } catch (error) {
      throw new Error(`Failed to resolve plugin "${nameOrPath}": ${error}`);
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
    fromDir?: string
  ): { rootPath: string; packageJsonPath: string } {
    // If target is already an absolute path to a directory, use it directly
    if (target.startsWith('/')) {
      const packageJsonPath = join(target, 'package.json');
      return { rootPath: target, packageJsonPath };
    }

    // Otherwise use Bun's module resolution
    const base = extname(target) ? dirname(target) : target;
    const packageJsonPath = Bun.resolveSync(join(base, 'package.json'), fromDir || import.meta.dir);
    return { rootPath: dirname(packageJsonPath), packageJsonPath };
  }
}
