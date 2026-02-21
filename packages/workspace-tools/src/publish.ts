#!/usr/bin/env bun

/**
 * workspace-tools — Interactive workspace publisher
 *
 * Usage:
 *   bun run publish-packages                              # interactive: pick packages
 *   bun run publish-packages --all                        # publish all public packages
 *   bun run publish-packages --filter "@brika/*"          # publish matching packages
 *   bun run publish-packages --dry-run                    # preview without publishing
 */

import { join } from 'node:path';
import { parseArgs } from 'node:util';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { plurals } from './plurals';
import {
  buildPublishArgs,
  fetchPublishedVersion,
  formatNpmHint,
  formatPackageLabel,
  formatPackagePreview,
  type PackageDetails,
  readPackageDetails,
} from './publish-utils';
import { getPrivateWorkspaceDependencyWarnings } from './publish-warnings';
import { getPreviewWarnings, runVerifyForPackages } from './verify-runner';
import { discoverPackages, filterPackages, type WorkspacePackage } from './workspace';

const ROOT = process.cwd();

const packageForms = { one: 'package', other: 'packages' };
const pluginForms = { one: 'plugin', other: 'plugins' };

function isPluginPackage(pkg: WorkspacePackage): boolean {
  return pkg.relativePath.startsWith('plugins/');
}

function parseFilters(filter: unknown): string[] {
  if (typeof filter === 'string') return [filter];
  if (!Array.isArray(filter)) return [];
  return filter.filter((entry): entry is string => typeof entry === 'string');
}

function mustGet<K, V>(map: Map<K, V>, key: K, errorMessage: string): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(errorMessage);
  return value;
}

const HELP = `
${pc.bold('workspace-tools')} — Interactive Workspace Publisher

${pc.bold('Usage:')}
  ${pc.cyan('bun run publish-packages')}                            ${pc.dim('Interactive: pick packages')}
  ${pc.cyan('bun run publish-packages')} ${pc.cyan('--all')}                  ${pc.dim('Publish all public packages')}
  ${pc.cyan('bun run publish-packages')} ${pc.cyan('--filter <pattern>')}      ${pc.dim('Publish matching packages')}
  ${pc.cyan('bun run publish-packages')} ${pc.cyan('--dry-run')}              ${pc.dim('Preview without publishing')}

${pc.bold('Flags:')}
  ${pc.cyan('-f, --filter <pattern>')}   Filter packages by name (glob, exact, or substring). Repeatable.
  ${pc.cyan('-a, --all')}                Skip package selection, publish all (or all filtered)
  ${pc.cyan('    --dry-run')}            Show what would be published without actually publishing
  ${pc.cyan('-h, --help')}               Show this help

${pc.bold('Note:')}
  npm 2FA / OTP prompts are handled interactively — the terminal is kept open
  so you can paste your code when prompted by npm.

${pc.bold('Examples:')}
  bun run publish-packages
  bun run publish-packages --all --dry-run
  bun run publish-packages --filter "@brika/*"
`;

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: false,
  strict: false,
  options: {
    help: { type: 'boolean', short: 'h', default: false },
    all: { type: 'boolean', short: 'a', default: false },
    'dry-run': { type: 'boolean', default: false },
    filter: { type: 'string', short: 'f', multiple: true },
  },
});

if (values.help) {
  console.log(HELP);
  process.exit(0);
}

try {
  const selectAll = values.all === true;
  const dryRun = values['dry-run'] === true;
  const filters = parseFilters(values.filter);

  const isNonInteractive = selectAll || filters.length > 0;

  p.intro(
    dryRun
      ? pc.bgYellow(pc.black(' workspace-tools — publish (dry run) '))
      : pc.bgCyan(pc.black(' workspace-tools — publish '))
  );

  const allPackages = await discoverPackages(ROOT);
  const publicPkgs = allPackages.filter((pkg) => !pkg.isPrivate);
  const privateWorkspacePackageNames = new Set(
    allPackages.filter((pkg) => pkg.isPrivate).map((pkg) => pkg.name)
  );
  const candidates = filterPackages(publicPkgs, filters);

  if (candidates.length === 0) {
    p.cancel(
      filters.length > 0
        ? 'No public packages matched the given --filter patterns.'
        : 'No public packages found in the workspace.'
    );
    process.exit(1);
  }

  // Fetch published npm versions for all candidates in parallel (used in multiselect hint)
  const npmSpinner = p.spinner();
  npmSpinner.start('Fetching published versions from npm…');
  const npmVersionMap = new Map<string, string | null>();
  await Promise.all(
    candidates.map(async (pkg) => {
      npmVersionMap.set(pkg.name, await fetchPublishedVersion(pkg.name));
    })
  );
  npmSpinner.stop('npm registry checked');

  // Package selection
  let selectedPackages = candidates;

  if (isNonInteractive) {
    p.log.info(`Publishing ${plurals(packageForms, selectedPackages.length)}`);
  } else {
    const available = pc.dim(`(${candidates.length} available)`);
    const keyHints = pc.dim(`[space] toggle, [a] select/deselect all`);
    const picked = await p.multiselect({
      message: `Select packages to publish ${available}\n${keyHints}`,
      options: candidates.map((pkg) => {
        const npmHint = formatNpmHint(npmVersionMap.get(pkg.name) ?? null);
        return {
          value: pkg,
          label: `${pc.cyan(pkg.name)}${pc.dim('@' + pkg.version)}`,
          hint: `${npmHint}  ${pkg.relativePath}`,
        };
      }),
      required: true,
    });

    if (p.isCancel(picked)) {
      p.cancel('Publish cancelled.');
      process.exit(0);
    }

    selectedPackages = picked;
  }

  // Load full package.json details for the preview
  const detailsMap = new Map<string, PackageDetails>();
  await Promise.all(
    selectedPackages.map(async (pkg) => {
      detailsMap.set(pkg.name, await readPackageDetails(pkg.path));
    })
  );

  const pluginPkgs = selectedPackages.filter((pkg) => isPluginPackage(pkg));
  const verifyScript = join(ROOT, 'packages/sdk/src/verify.ts');
  const pluginWarningsMap = new Map<string, string[]>();
  if (pluginPkgs.length > 0) {
    const pluginLabel = plurals(pluginForms, pluginPkgs.length);
    const verifyPreviewSpinner = p.spinner();
    verifyPreviewSpinner.start(`Checking ${pluginLabel}…`);

    const previewResults = await runVerifyForPackages(verifyScript, pluginPkgs, ROOT, true);
    for (const result of previewResults) {
      const warnings = getPreviewWarnings(result);
      if (warnings) {
        pluginWarningsMap.set(result.pkg.name, warnings);
      }
    }

    verifyPreviewSpinner.stop(`${pluginLabel} checked`);
  }

  // Show preview
  p.log.step('Packages to publish:');
  for (const pkg of selectedPackages) {
    const details = mustGet(detailsMap, pkg.name, `Missing package details for ${pkg.name}`);
    const publishedVersion = mustGet(
      npmVersionMap,
      pkg.name,
      `Missing npm version lookup for ${pkg.name}`
    );
    const pluginWarnings = pluginWarningsMap.get(pkg.name) ?? [];
    const privateDependencyWarnings = getPrivateWorkspaceDependencyWarnings(
      details,
      privateWorkspacePackageNames
    );
    const extraWarnings = [...pluginWarnings, ...privateDependencyWarnings];
    console.log(
      formatPackagePreview(pkg.name, pkg.version, details, publishedVersion, extraWarnings)
    );
    console.log();
  }

  // Confirm
  const count = selectedPackages.length;
  const dryTag = dryRun ? pc.yellow(' (dry run)') : '';

  const confirmed = await p.confirm({
    message: `Publish ${pc.bold(String(count))} ${plurals(packageForms, count)} to npm?${dryTag}`,
    initialValue: true,
  });

  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel('Publish cancelled.');
    process.exit(0);
  }

  // Verify plugins before publishing
  if (pluginPkgs.length > 0) {
    const verifySpinner = p.spinner();
    const pluginLabel = plurals(pluginForms, pluginPkgs.length);
    verifySpinner.start(`Verifying ${pluginLabel}…`);

    const verifyResults = await runVerifyForPackages(verifyScript, pluginPkgs, ROOT);

    const verifyFailed = verifyResults.filter((r) => r.exitCode !== 0);
    const verifyPassed = verifyResults.filter((r) => r.exitCode === 0);

    if (verifyFailed.length === 0) {
      verifySpinner.stop(pc.green(`${pluginLabel} verified ✓`));
      for (const { pkg } of verifyPassed) {
        p.log.success(`${pc.bold(pkg.name)} ${pc.green('valid ✓')}`);
      }
    } else {
      verifySpinner.stop(
        pc.red(
          `${verifyFailed.length}/${pluginPkgs.length} ${plurals(pluginForms, verifyFailed.length)} failed verification`
        )
      );
      for (const { pkg } of verifyPassed) {
        p.log.success(`${pc.bold(pkg.name)} ${pc.green('valid ✓')}`);
      }
      for (const { pkg, output } of verifyFailed) {
        p.log.error(`${pc.bold(pkg.name)}:`);
        if (output) console.log(output);
      }
      p.cancel('Fix plugin verification errors before publishing.');
      process.exit(1);
    }
  }

  // Run bun install at root to resolve workspace: protocol versions
  const installSpinner = p.spinner();
  installSpinner.start('Running bun install at workspace root…');

  const installProc = Bun.spawn(['bun', 'install'], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const installExit = await installProc.exited;

  if (installExit !== 0) {
    const stderr = await new Response(installProc.stderr).text();
    installSpinner.stop(pc.red('bun install failed'));
    p.log.error(stderr);
    process.exit(1);
  }

  installSpinner.stop(pc.green('bun install complete'));

  // Publish each package
  const failed: string[] = [];
  const publishArgs = buildPublishArgs(dryRun);

  for (const pkg of selectedPackages) {
    const pkgDir = join(pkg.path, '..');
    const label = formatPackageLabel(pkg.name, pkg.version);

    p.log.step(`Publishing ${label}…`);

    const proc = Bun.spawn(publishArgs, {
      cwd: pkgDir,
      stdout: 'inherit',
      stderr: 'inherit',
      stdin: 'inherit', // keeps terminal open for interactive auth (OTP paste etc.)
    });

    const exitCode = await proc.exited;

    if (exitCode === 0) {
      p.log.success(`${pc.green('Published: ')}${label}${dryTag}`);
    } else {
      p.log.error(`${pc.red('Failed: ')}${label}`);
      failed.push(pkg.name);
    }
  }

  // Summary
  const published = count - failed.length;
  if (failed.length > 0) {
    const dryNote = dryRun ? ' (dry run)' : '';
    const summary = pc.yellow(
      `${published}/${count} ${plurals(packageForms, count)} published${dryNote}`
    );
    p.outro(`${summary}\n  ${pc.red('Failed: ')}${failed.join(', ')}`);
    process.exit(1);
  } else {
    const dryNote = dryRun ? ' (dry run — nothing written)' : '';
    p.outro(pc.green(`${plurals(packageForms, count)} published${dryNote}`));
  }
} catch (error) {
  if (error instanceof Error && error.message === 'cancelled') {
    process.exit(0);
  }
  p.cancel('An unexpected error occurred.');
  console.error(error);
  process.exit(1);
}
