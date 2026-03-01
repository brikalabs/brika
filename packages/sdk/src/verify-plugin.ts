/**
 * Core verification logic for Brika plugin packages.
 * Exported so it can be imported and tested directly.
 *
 * Checks are auto-registered — add a new file to verify-checks/ and
 * import it from verify-checks/index.ts to include it.
 */

import { resolve } from 'node:path';
import { PluginPackageSchema } from '@brika/schema/plugin';
import './verify-checks';
import { runChecks } from './verify-checks/registry';

/** Generic type guard — used by verify.ts for lock file / dependency parsing */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

/**
 * Reads a dependency version specifier from a raw package.json object.
 * Searches dependencies, peerDependencies, devDependencies in order.
 * Returns null if the package is not found in any dependency map.
 */
export function readDependencyVersion(raw: unknown, packageName: string): string | null {
  if (!isRecord(raw)) {
    return null;
  }
  const candidates = [raw.dependencies, raw.peerDependencies, raw.devDependencies];
  for (const deps of candidates) {
    if (!isRecord(deps)) {
      continue;
    }
    const value = deps[packageName];
    if (typeof value === 'string') {
      return value;
    }
  }
  return null;
}

export interface VerifyResult {
  name: string;
  version: string;
  enginesBrika: string | undefined;
  schemaUrl: string | undefined;
  errors: string[];
  warnings: string[];
  passed: boolean;
}

/**
 * Verifies a Brika plugin package.json.
 *
 * First validates structure with the Zod schema. If the schema fails,
 * returns the schema errors immediately — no runtime checks are run.
 * If the schema passes, runtime checks receive a fully typed object.
 *
 * @param pluginDir  Absolute path to the plugin directory (containing package.json)
 * @param sdkVersion Current @brika/sdk version to check engines.brika against
 */
export async function verifyPlugin(pluginDir: string, sdkVersion: string): Promise<VerifyResult> {
  const pkgPath = resolve(pluginDir, 'package.json');
  const parsed = await Bun.file(pkgPath).json();

  const schemaResult = PluginPackageSchema.safeParse(parsed);

  if (!schemaResult.success) {
    const raw = isRecord(parsed) ? parsed : {};
    const schemaErrors = schemaResult.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
      return `Schema: ${path}${issue.message}`;
    });
    return {
      name: typeof raw.name === 'string' ? raw.name : '(unknown)',
      version: typeof raw.version === 'string' ? raw.version : '?',
      enginesBrika: undefined,
      schemaUrl: undefined,
      errors: schemaErrors,
      warnings: [],
      passed: false,
    };
  }

  const pkg = schemaResult.data;
  const { errors, warnings } = await runChecks({
    pkg,
    pluginDir,
    sdkVersion,
  });

  return {
    name: pkg.name,
    version: pkg.version,
    enginesBrika: pkg.engines.brika,
    schemaUrl: pkg.$schema,
    errors,
    warnings,
    passed: errors.length === 0,
  };
}
