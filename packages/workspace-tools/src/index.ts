#!/usr/bin/env bun

/**
 * workspace-tools — Interactive workspace version bumper
 *
 * Usage:
 *   bun run bump                              # interactive: pick type + packages
 *   bun run bump minor                        # interactive: type pre-selected, pick packages
 *   bun run bump minor --all                  # non-interactive: all packages
 *   bun run bump minor --filter "@brika/*"    # non-interactive: matching packages
 *   bun run bump minor --dry-run              # preview without writing
 *   bun run bump minor --since v0.3.0         # detect changes since a git ref
 */

import { parseArgs } from 'node:util';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { getChangedPackages, getLastTag } from './git';
import { plurals } from './plurals';
import { promptForBump } from './prompts';
import { applyBump, compareVersions, isBumpType, isExactVersion } from './semver';
import type { WorkspacePackage } from './workspace';
import { applyVersionToPackages, discoverPackages, filterPackages } from './workspace';

const ROOT = process.cwd();
const packageCountForms = {
  '=0': 'no packages',
  one: '# package',
  other: '# packages',
};

const HELP = `
${pc.bold('workspace-tools')} — Interactive Workspace Version Bumper

${pc.bold('Usage:')}
  ${pc.cyan('bun run bump')}                                ${pc.dim('Interactive: pick type + packages')}
  ${pc.cyan('bun run bump')} ${pc.cyan('<type>')}                         ${pc.dim('Interactive: type pre-selected')}
  ${pc.cyan('bun run bump')} ${pc.cyan('<type>')} ${pc.cyan('--all')}                  ${pc.dim('Apply to all packages')}
  ${pc.cyan('bun run bump')} ${pc.cyan('<type>')} ${pc.cyan('--filter <pattern>')}      ${pc.dim('Apply to matching packages')}
  ${pc.cyan('bun run bump')} ${pc.cyan('<type>')} ${pc.cyan('--dry-run')}              ${pc.dim('Preview without writing')}
  ${pc.cyan('bun run bump')} ${pc.cyan('<type>')} ${pc.cyan('--since <ref>')}           ${pc.dim('Detect changes since a git ref')}

${pc.bold('Bump types:')}
  major  minor  patch  x.y.z

${pc.bold('Flags:')}
  ${pc.cyan('-f, --filter <pattern>')}   Filter packages by name (glob, exact, or substring). Repeatable.
  ${pc.cyan('-a, --all')}                Skip package selection, apply to all (or all filtered)
  ${pc.cyan('    --dry-run')}            Show what would change without writing files
  ${pc.cyan('-s, --since <ref>')}        Compare against this git ref (tag, branch, commit).
  ${pc.cyan('                ')}         Defaults to the latest tag. Skipped if no baseline found.
  ${pc.cyan('-h, --help')}               Show this help

${pc.bold('Filter examples:')}
  --filter "@brika/*"         All @brika scoped packages
  --filter hub                Any package whose name contains "hub"
  --filter @brika/hub         Exact match
  -f @brika/hub -f @brika/ui  Multiple filters

${pc.bold('Examples:')}
  bun run bump
  bun run bump minor
  bun run bump minor --all
  bun run bump minor --filter "@brika/*" --dry-run
  bun run bump 1.0.0 --all
  bun run bump --since v0.3.0
`;

const { positionals, values } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  strict: false,
  options: {
    help: {
      type: 'boolean',
      short: 'h',
      default: false,
    },
    all: {
      type: 'boolean',
      short: 'a',
      default: false,
    },
    'dry-run': {
      type: 'boolean',
      default: false,
    },
    filter: {
      type: 'string',
      short: 'f',
      multiple: true,
    },
    since: {
      type: 'string',
      short: 's',
    },
  },
});

if (values.help) {
  console.log(HELP);
  process.exit(0);
}

try {
  const bumpArg = positionals[0];
  const selectAll = values.all === true;
  const dryRun = values['dry-run'] === true;
  const filters = (values.filter ?? []) as string[];
  const sinceFlag = values.since as string | undefined;

  // Validate bump arg if provided
  if (bumpArg && !isBumpType(bumpArg) && !isExactVersion(bumpArg)) {
    console.error(
      `${pc.red('\n  error ')}Unknown bump "${bumpArg}". Use major, minor, patch, or x.y.z.\n`
    );
    process.exit(1);
  }

  const allPackages = await discoverPackages(ROOT);
  const currentVersion = allPackages[0]?.version ?? '0.0.0';
  const candidatePackages = filterPackages(allPackages, filters);

  if (candidatePackages.length === 0) {
    console.error(`${pc.red('\n  error ')}No packages matched the given --filter patterns.\n`);
    process.exit(1);
  }

  const isNonInteractive = selectAll || filters.length > 0;

  if (isNonInteractive && !bumpArg) {
    console.error(
      `${pc.red('\n  error ')}--all / --filter require a bump type (e.g. bun run bump minor --all)\n`
    );
    process.exit(1);
  }

  // Detect changed packages via git (best-effort, skipped if no baseline found)
  const sinceRef = sinceFlag ?? (await getLastTag(ROOT)) ?? undefined;
  const changedPackages = sinceRef
    ? await getChangedPackages(ROOT, sinceRef, candidatePackages)
    : undefined;

  let nextVersion: string;
  let selectedPackages: WorkspacePackage[];

  if (isNonInteractive) {
    // Non-interactive path: bump type + packages are fully determined by flags
    nextVersion = applyBump(currentVersion, bumpArg ?? 'patch');
    selectedPackages = candidatePackages;

    if (compareVersions(currentVersion, nextVersion) === 0) {
      console.log(pc.yellow(`\n  Already at v${currentVersion}\n`));
      process.exit(0);
    }

    console.log();
    for (const pkg of selectedPackages) {
      const changed = changedPackages ? changedPackages.has(pkg.name) : undefined;
      let badge = '  ';
      if (changed === true) {
        badge = pc.green('● ');
      } else if (changed === false) {
        badge = pc.dim('○ ');
      }
      const arrow = pkg.version === nextVersion ? pc.dim(' = ') : ' → ';
      const path = pc.dim(pkg.relativePath.padEnd(43));
      const ver = pc.dim(pkg.version);
      console.log(`  ${badge}${path}${ver}${arrow}${pc.cyan(nextVersion)}`);
    }
    if (sinceRef && changedPackages) {
      console.log(pc.dim(`\n  ● changed  ○ no changes since ${sinceRef}`));
    }
    console.log();
    const updated = await applyVersionToPackages(selectedPackages, nextVersion, dryRun);
    const dryTag = dryRun ? pc.yellow(' (dry run)') : '';
    for (const pkg of updated) {
      console.log(`  ${pc.green('✓')}${dryTag}  ${pc.dim(pkg.relativePath)}`);
    }
    const dryNote = dryRun ? ' (dry run — no files written)' : '';
    console.log(pc.bold(`\n  ${plurals(packageCountForms, updated.length)} updated${dryNote}\n`));
  } else {
    // Interactive path: bump type and/or package selection via prompts
    const config = await promptForBump(candidatePackages, currentVersion, {
      preselectedBump: bumpArg,
      selectAll,
      dryRun,
      changedPackages,
      sinceRef,
    });
    nextVersion = config.nextVersion;
    selectedPackages = config.selectedPackages;

    await applyVersionToPackages(selectedPackages, nextVersion, dryRun);
    const dryMsg = dryRun ? ' (dry run — no files written)' : '';
    p.outro(
      pc.green(
        `${plurals(packageCountForms, selectedPackages.length)} updated to v${nextVersion}${dryMsg}`
      )
    );
  }
} catch (error) {
  if (error instanceof Error && error.message === 'cancelled') {
    process.exit(0);
  }
  p.cancel('An unexpected error occurred.');
  console.error(error);
  process.exit(1);
}
