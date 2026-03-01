/**
 * brika-verify-plugin — Verify a Brika plugin package.json
 *
 * Checks:
 *   1. Schema validation against @brika/schema (required fields, types, formats)
 *   2. engines.brika covers the current @brika/sdk version
 *   3. $schema URL is present and points to the Brika plugin schema
 *
 * Usage:
 *   bun run verify <plugin-dir>      # verify a specific plugin
 *   bun run verify                   # verify the current directory
 */

import { resolve } from 'node:path';
import pc from 'picocolors';
import { isRecord, readDependencyVersion, verifyPlugin } from './verify-plugin';

const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const pluginDirArg = args.find((arg) => arg !== '--json');
const pluginDir = pluginDirArg ? resolve(pluginDirArg) : process.cwd();

async function readVersion(pkgJsonPath: string | URL): Promise<string | null> {
  try {
    const raw = await Bun.file(pkgJsonPath).json();
    if (!isRecord(raw)) {
      return null;
    }
    return typeof raw.version === 'string' ? raw.version : null;
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

async function resolveSdkVersion(fromDir: string): Promise<string> {
  const localVersion = await readVersion(new URL('../package.json', import.meta.url));
  if (!localVersion) {
    throw new Error('Could not resolve @brika/sdk version');
  }

  const pluginSdkSpec = await readPluginSdkSpec(fromDir);
  if (pluginSdkSpec?.startsWith('workspace:')) {
    return localVersion;
  }

  if (pluginSdkSpec) {
    try {
      const resolved = Bun.resolveSync('@brika/sdk/package.json', fromDir);
      const resolvedVersion = await readVersion(resolved);
      if (resolvedVersion) {
        return resolvedVersion;
      }
    } catch {
      // Fall back to local workspace SDK version below.
    }
  }

  return localVersion;
}

const sdkVersion = await resolveSdkVersion(pluginDir);

let result;
try {
  result = await verifyPlugin(pluginDir, sdkVersion);
} catch {
  console.error(`${pc.red('✗')} Could not read ${resolve(pluginDir, 'package.json')}`);
  process.exit(1);
}

if (jsonOutput) {
  const payload = {
    name: result.name,
    version: result.version,
    enginesBrika: result.enginesBrika,
    schemaUrl: result.schemaUrl,
    sdkVersion,
    errors: result.errors,
    warnings: result.warnings,
    passed: result.passed,
  };
  console.log(JSON.stringify(payload));
  process.exit(result.passed ? 0 : 1);
}

const pluginLabel = pc.cyan(`${result.name}@${result.version}`);
console.log(pc.bold(`\n  Verifying ${pluginLabel}\n`));

// Print passing checks
const schemaErrors = result.errors.filter((e) => e.startsWith('Schema:'));
if (schemaErrors.length === 0) {
  console.log(`  ${pc.green('✓')}  schema validation passed`);
}
if (result.enginesBrika && !result.errors.some((e) => e.startsWith('engines.brika'))) {
  const enginesRange = pc.dim(`"${result.enginesBrika}"`);
  console.log(
    `  ${pc.green('✓')}  engines.brika ${enginesRange} covers SDK ${pc.cyan(sdkVersion)}`
  );
}
const hasMainSchemaError = result.errors.some((e) => e.startsWith('Schema: main:'));
const hasMainPathError = result.errors.some((e) => e.startsWith('main path "'));
if (!hasMainSchemaError && !hasMainPathError) {
  console.log(`  ${pc.green('✓')}  main entrypoint exists`);
}
if (result.schemaUrl?.includes('schema.brika.dev')) {
  console.log(`  ${pc.green('✓')}  $schema ${pc.dim(result.schemaUrl)}`);
}
const hasBrikaKeywordError = result.errors.some((e) =>
  e.startsWith('keywords must include "brika"')
);
const hasBrikaPluginKeywordWarning = result.warnings.some((w) =>
  w.startsWith('keywords should include "brika-plugin"')
);
if (!hasBrikaKeywordError) {
  console.log(`  ${pc.green('✓')}  keywords include ${pc.cyan('brika')}`);
}
if (!hasBrikaPluginKeywordWarning) {
  console.log(`  ${pc.green('✓')}  keywords include ${pc.cyan('brika-plugin')}`);
}

// Print warnings
if (result.warnings.length > 0) {
  console.log();
  for (const w of result.warnings) {
    console.log(`  ${pc.yellow('⚠')}  ${w}`);
  }
}

// Print errors and exit
if (result.errors.length > 0) {
  console.log();
  for (const e of result.errors) {
    console.log(`  ${pc.red('✗')}  ${e}`);
  }
  const count = result.errors.length;
  console.log(pc.red(`\n  Verification failed — ${count} error${count === 1 ? '' : 's'}\n`));
  process.exit(1);
}

console.log(pc.green('\n  Verification passed\n'));
