/**
 * `brika verify`: validate a plugin's package.json before publishing.
 *
 * Checks schema validity (@brika/schema), that `engines.brika` covers the SDK
 * version, the `$schema` URL, the `main` entrypoint, required keywords, and
 * publish-file coverage. Replaces the standalone `brika-verify-plugin` bin so
 * there is one CLI. `--json` emits machine output; the exit code is non-zero on
 * failure for CI.
 */

import { resolve } from 'node:path';
import { defineCommand } from '@brika/cli';
import pc from 'picocolors';
import {
  isRecord,
  readDependencyVersion,
  type VerifyResult,
  verifyPlugin,
} from '../../verify-plugin';

async function readVersion(pkgJsonPath: string | URL): Promise<string | null> {
  try {
    const raw = await Bun.file(pkgJsonPath).json();
    return isRecord(raw) && typeof raw.version === 'string' ? raw.version : null;
  } catch {
    return null;
  }
}

async function readPluginSdkSpec(fromDir: string): Promise<string | null> {
  try {
    const raw = await Bun.file(resolve(fromDir, 'package.json')).json();
    return readDependencyVersion(raw, '@brika/sdk');
  } catch {
    return null;
  }
}

/**
 * The SDK version to check `engines.brika` against: the plugin's installed
 * `@brika/sdk` when resolvable, else the one this CLI ships with.
 */
async function resolveSdkVersion(fromDir: string): Promise<string> {
  const localVersion = await readVersion(
    Bun.resolveSync('@brika/sdk/package.json', import.meta.dir)
  );
  if (!localVersion) {
    throw new Error('Could not resolve @brika/sdk version');
  }
  const pluginSdkSpec = await readPluginSdkSpec(fromDir);
  if (pluginSdkSpec && !pluginSdkSpec.startsWith('workspace:')) {
    try {
      const resolvedVersion = await readVersion(
        Bun.resolveSync('@brika/sdk/package.json', fromDir)
      );
      if (resolvedVersion) {
        return resolvedVersion;
      }
    } catch {
      // Fall back to the CLI's bundled SDK version.
    }
  }
  return localVersion;
}

/** Print the passing checks that have no matching error/warning. */
function printPassing(result: VerifyResult, sdkVersion: string): void {
  if (!result.errors.some((e) => e.startsWith('Schema:'))) {
    process.stdout.write(`  ${pc.green('✓')}  schema validation passed\n`);
  }
  if (result.enginesBrika && !result.errors.some((e) => e.startsWith('engines.brika'))) {
    process.stdout.write(
      `  ${pc.green('✓')}  engines.brika ${pc.dim(`"${result.enginesBrika}"`)} covers SDK ${pc.cyan(sdkVersion)}\n`
    );
  }
  if (!result.errors.some((e) => e.startsWith('Schema: main:') || e.startsWith('main path "'))) {
    process.stdout.write(`  ${pc.green('✓')}  main entrypoint exists\n`);
  }
  if (result.schemaUrl?.includes('schema.brika.dev')) {
    process.stdout.write(`  ${pc.green('✓')}  $schema ${pc.dim(result.schemaUrl)}\n`);
  }
  if (!result.errors.some((e) => e.startsWith('keywords must include "brika"'))) {
    process.stdout.write(`  ${pc.green('✓')}  keywords include ${pc.cyan('brika')}\n`);
  }
  if (!result.warnings.some((w) => w.startsWith('keywords should include "brika-plugin"'))) {
    process.stdout.write(`  ${pc.green('✓')}  keywords include ${pc.cyan('brika-plugin')}\n`);
  }
}

/** Render the human-readable report; returns true when verification passed. */
function printReport(result: VerifyResult, sdkVersion: string): boolean {
  process.stdout.write(pc.bold(`\n  Verifying ${pc.cyan(`${result.name}@${result.version}`)}\n\n`));
  printPassing(result, sdkVersion);
  if (result.warnings.length > 0) {
    process.stdout.write('\n');
    for (const w of result.warnings) {
      process.stdout.write(`  ${pc.yellow('⚠')}  ${w}\n`);
    }
  }
  if (result.errors.length > 0) {
    process.stdout.write('\n');
    for (const e of result.errors) {
      process.stdout.write(`  ${pc.red('✗')}  ${e}\n`);
    }
    const count = result.errors.length;
    process.stdout.write(
      pc.red(`\n  Verification failed: ${count} error${count === 1 ? '' : 's'}\n\n`)
    );
    return false;
  }
  process.stdout.write(pc.green('\n  Verification passed\n\n'));
  return true;
}

export default defineCommand({
  name: 'verify',
  description: 'Validate a plugin package.json (schema, engines.brika, $schema, keywords)',
  details:
    'Run before publishing a plugin. Checks the manifest against @brika/schema, that ' +
    'engines.brika covers the SDK version, the $schema URL, the main entrypoint, keywords, ' +
    'and publish-file coverage. Exits non-zero on failure for CI.',
  options: {
    dir: { type: 'string', description: 'Plugin directory (default: current directory)' },
    json: { type: 'boolean', description: 'Machine-readable JSON output' },
  },
  examples: ['brika verify', 'brika verify --dir plugins/timer', 'brika verify --json'],
  async handler({ values }) {
    const pluginDir = resolve(values.dir ?? process.cwd());
    const sdkVersion = await resolveSdkVersion(pluginDir);

    let result: VerifyResult;
    try {
      result = await verifyPlugin(pluginDir, sdkVersion);
    } catch {
      process.stderr.write(`${pc.red('✗')} Could not read ${resolve(pluginDir, 'package.json')}\n`);
      process.exitCode = 1;
      return;
    }

    if (values.json) {
      process.stdout.write(`${JSON.stringify({ ...result, sdkVersion })}\n`);
      if (!result.passed) {
        process.exitCode = 1;
      }
      return;
    }

    if (!printReport(result, sdkVersion)) {
      process.exitCode = 1;
    }
  },
});
