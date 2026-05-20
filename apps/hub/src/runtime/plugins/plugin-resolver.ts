import { dirname, extname, join, resolve } from 'node:path';
import { BrikaError } from '@brika/ipc';
import { PluginPackageSchema } from '@brika/schema';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function pluginNameFromRaw(raw: unknown): string {
  return isRecord(raw) && typeof raw.name === 'string' ? raw.name : '(unknown)';
}

/**
 * Load and parse package.json with Zod validation. Throws typed BrikaErrors:
 *
 *   - `MANIFEST_MISSING_MAIN` when the `main` field is absent (most common
 *     manifest mistake — surfaced separately so the UI can show a one-line
 *     fix hint)
 *   - `MANIFEST_INVALID` for every other Zod failure; `data.issues` lists
 *     each failing path and `.cause` is the underlying ZodError
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

  const pluginName = pluginNameFromRaw(raw);
  const hasMissingMain = parsed.error.issues.some(
    (issue) => issue.path.length === 1 && issue.path[0] === 'main'
  );
  if (hasMissingMain) {
    throw new BrikaError(
      'MANIFEST_MISSING_MAIN',
      `Plugin "${pluginName}" must have a "main" field in package.json`,
      { data: { pluginName }, cause: parsed.error }
    );
  }

  const issues = parsed.error.issues.map((issue) => ({
    path: issue.path.map(String),
    message: issue.message,
  }));
  throw new BrikaError(
    'MANIFEST_INVALID',
    `Plugin "${pluginName}" has an invalid package.json (${issues.length} issue${issues.length === 1 ? '' : 's'})`,
    { data: { pluginName, issues }, cause: parsed.error }
  );
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

    // No catch-all wrapper — typed BrikaError throws from
    // `loadPluginPackageJson` (`MANIFEST_INVALID`, `MANIFEST_MISSING_MAIN`)
    // pass through unchanged, so the hub HTTP catch can surface them
    // with the right status and structured body via brikaErrorToResponse.
    const { rootPath, packageJsonPath } = this.#resolvePackageJson(moduleId, parent);
    const metadata = await loadPluginPackageJson(packageJsonPath);
    const entryPoint = this.#extractEntryPoint(metadata, rootPath);

    return {
      rootDirectory: rootPath,
      entryPoint,
      metadata,
    };
  }

  #extractEntryPoint(metadata: PluginPackageSchema, rootPath: string): string {
    // Defense in depth: the Zod schema already requires `main`, but if a
    // future schema change relaxes it, surface the same typed code.
    if (!metadata.main) {
      throw new BrikaError(
        'MANIFEST_MISSING_MAIN',
        `Plugin "${metadata.name}" must have a "main" field in package.json`,
        { data: { pluginName: metadata.name } }
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
