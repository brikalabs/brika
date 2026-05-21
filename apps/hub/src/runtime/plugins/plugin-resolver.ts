import { dirname, extname, join, resolve } from 'node:path';
import { BrikaError } from '@brika/ipc';
import { PluginPackageSchema } from '@brika/schema';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

/**
 * Load and parse package.json with Zod validation
 */
export async function loadPluginPackageJson(packageJsonPath: string) {
  const raw = await import(packageJsonPath, {
    with: {
      type: 'json',
    },
  });
  const parsed = PluginPackageSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }

  const hasMissingMain = parsed.error.issues.some(
    (issue) => issue.path.length === 1 && issue.path[0] === 'main'
  );
  if (hasMissingMain) {
    const name = isRecord(raw) && typeof raw.name === 'string' ? raw.name : '(unknown)';
    throw new BrikaError(
      'MANIFEST_MISSING_MAIN',
      `Plugin "${name}" must have a "main" field in package.json`,
      { data: { manifestPath: packageJsonPath } }
    );
  }

  throw new BrikaError('MANIFEST_INVALID', 'Plugin package.json failed schema validation', {
    data: { manifestPath: packageJsonPath },
    cause: parsed.error,
  });
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
      throw new BrikaError('INVALID_INPUT', 'Plugin moduleId is required', {
        data: { field: 'moduleId' },
      });
    }

    try {
      // Use Bun's module resolution to find package.json
      const { rootPath, packageJsonPath } = this.#resolvePackageJson(moduleId, parent);

      // Read and validate package.json
      const metadata = await loadPluginPackageJson(packageJsonPath);

      // Extract entry point
      const entryPoint = this.#extractEntryPoint(metadata, rootPath, packageJsonPath);

      return {
        rootDirectory: rootPath,
        entryPoint,
        metadata,
      };
    } catch (error) {
      if (error instanceof BrikaError) {
        throw error;
      }
      throw new BrikaError(
        'MANIFEST_INVALID',
        `Failed to resolve plugin "${moduleId}": ${error instanceof Error ? error.message : String(error)}`,
        {
          data: { manifestPath: moduleId },
          cause: error,
        }
      );
    }
  }

  #extractEntryPoint(
    metadata: PluginPackageSchema,
    rootPath: string,
    manifestPath: string
  ): string {
    // main field is required
    if (!metadata.main) {
      throw new BrikaError(
        'MANIFEST_MISSING_MAIN',
        `Plugin "${metadata.name}" must have a "main" field in package.json`,
        { data: { manifestPath } }
      );
    }

    return resolve(rootPath, metadata.main);
  }

  #resolvePackageJson(
    target: string,
    parent?: string
  ): {
    rootPath: string;
    packageJsonPath: string;
  } {
    // If target is already an absolute path to a directory, use it directly
    if (target.startsWith('/')) {
      const packageJsonPath = join(target, 'package.json');
      return {
        rootPath: target,
        packageJsonPath,
      };
    }

    // Otherwise use Bun's module resolution
    const base = extname(target) ? dirname(target) : target;
    const packageJsonPath = Bun.resolveSync(join(base, 'package.json'), parent || import.meta.dir);
    return {
      rootPath: dirname(packageJsonPath),
      packageJsonPath,
    };
  }
}
