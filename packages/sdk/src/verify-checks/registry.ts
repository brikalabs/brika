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

/**
 * Copy-pastable fix hint attached to an error or warning.
 *
 * - `description` is a short, human-readable instruction shown to the user.
 * - `snippet` is the literal text the user can paste into their package.json.
 * - `language` hints at the snippet's syntax for renderers/fence labels.
 */
export interface Suggestion {
  /** Short human-readable description of the fix. */
  description: string;
  /** Copy-pastable snippet (typically a JSON fragment). */
  snippet: string;
  /** Optional fence language hint for renderers. Defaults to 'json'. */
  language?: 'json' | 'jsonc';
  /**
   * The message text (error or warning) this suggestion is attached to.
   * Used by the CLI to print the suggestion directly under its diagnostic.
   */
  for: string;
}

export interface CheckDiagnostics {
  errors?: string[];
  warnings?: string[];
  /** Optional copy-pastable fix hints linked to specific errors/warnings. */
  suggestions?: Suggestion[];
}

export type PluginCheck = (ctx: CheckContext) => Promise<CheckDiagnostics> | CheckDiagnostics;

const checks: PluginCheck[] = [];

export function registerCheck(check: PluginCheck): void {
  checks.push(check);
}

export async function runChecks(ctx: CheckContext): Promise<{
  errors: string[];
  warnings: string[];
  suggestions: Suggestion[];
}> {
  const settled = await Promise.allSettled(checks.map((check) => Promise.resolve(check(ctx))));
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: Suggestion[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      errors.push(...(result.value.errors ?? []));
      warnings.push(...(result.value.warnings ?? []));
      suggestions.push(...(result.value.suggestions ?? []));
    } else {
      errors.push(`Check failed unexpectedly: ${String(result.reason)}`);
    }
  }
  return {
    errors,
    warnings,
    suggestions,
  };
}
