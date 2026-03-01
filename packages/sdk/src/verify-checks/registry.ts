/**
 * Plugin verification check registry.
 *
 * Each check file calls `registerCheck()` at module level.
 * `runChecks()` collects all diagnostics by running every registered check.
 */

import type { PluginPackageSchema } from '@brika/schema/plugin';

export interface CheckContext {
  /** Fully typed, schema-validated package.json */
  pkg: PluginPackageSchema;
  pluginDir: string;
  sdkVersion: string;
}

export interface CheckDiagnostics {
  errors?: string[];
  warnings?: string[];
}

export type PluginCheck = (ctx: CheckContext) => Promise<CheckDiagnostics> | CheckDiagnostics;

const checks: PluginCheck[] = [];

export function registerCheck(check: PluginCheck): void {
  checks.push(check);
}

export async function runChecks(ctx: CheckContext): Promise<{
  errors: string[];
  warnings: string[];
}> {
  const settled = await Promise.allSettled(checks.map((check) => Promise.resolve(check(ctx))));
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      errors.push(...(result.value.errors ?? []));
      warnings.push(...(result.value.warnings ?? []));
    } else {
      errors.push(`Check failed unexpectedly: ${String(result.reason)}`);
    }
  }
  return {
    errors,
    warnings,
  };
}
