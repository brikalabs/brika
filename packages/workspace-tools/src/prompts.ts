/**
 * Interactive prompts for the workspace version bumper.
 * Follows the @clack/prompts patterns established in create-brika.
 */

import * as p from '@clack/prompts';
import pc from 'picocolors';
import { applyBump, BUMP_TYPES, compareVersions, isExactVersion } from './semver';
import type { WorkspacePackage } from './workspace';

export interface BumpConfig {
  nextVersion: string;
  selectedPackages: WorkspacePackage[];
}

export interface PromptOptions {
  /** When set, the bump type question is skipped. */
  preselectedBump?: string;
  /** When true, the package multiselect is skipped (all provided packages are used). */
  selectAll?: boolean;
  /** When true, shows a dry-run indicator in the intro. */
  dryRun?: boolean;
  /**
   * Set of package names that have changed since the last release.
   * When provided, only changed packages are pre-selected; unchanged packages
   * are still shown but unselected by default.
   * When absent, all packages are pre-selected (previous behaviour).
   */
  changedPackages?: Set<string>;
  /** The git ref used to detect changes, shown in the intro (e.g. "v0.3.0"). */
  sinceRef?: string;
}

/**
 * Run the interactive bump flow.
 *
 * @param allPackages - Packages to offer for selection (may already be pre-filtered).
 * @param currentVersion - Version read from the root package.json.
 * @param options - Optional overrides to skip specific steps.
 */
export async function promptForBump(
  allPackages: WorkspacePackage[],
  currentVersion: string,
  options: PromptOptions = {}
): Promise<BumpConfig> {
  const { preselectedBump, selectAll = false, dryRun = false, changedPackages, sinceRef } = options;

  p.intro(
    dryRun
      ? pc.bgYellow(pc.black(' workspace-tools — dry run '))
      : pc.bgCyan(pc.black(' workspace-tools '))
  );

  const uniqueVersions = [...new Set(allPackages.map((pkg) => pkg.version))];
  if (uniqueVersions.length === 1) {
    p.log.info(
      'Current version: ' +
        pc.cyan(currentVersion) +
        pc.dim(' (' + allPackages.length + ' packages)')
    );
  } else {
    p.log.warn('Package versions are out of sync:');
    for (const pkg of allPackages) {
      console.log('  ' + pc.dim(pkg.relativePath.padEnd(45)) + pc.cyan(pkg.version));
    }
  }

  if (changedPackages !== undefined) {
    const since = sinceRef ? pc.dim(' since ' + sinceRef) : '';
    p.log.info(
      pc.green(String(changedPackages.size)) +
        ' of ' +
        allPackages.length +
        ' packages have changes' +
        since
    );
  }

  const answers = await p.group(
    {
      bumpType: () => {
        if (preselectedBump) {
          const next = isExactVersion(preselectedBump)
            ? preselectedBump
            : applyBump(currentVersion, preselectedBump);
          p.log.info(`Bump type: ${pc.cyan(preselectedBump)} → ${pc.green(next)}`);
          return Promise.resolve(preselectedBump);
        }
        return p.select({
          message: 'How do you want to bump the version?',
          options: [
            ...BUMP_TYPES.map((type) => ({
              value: type,
              label: type.charAt(0).toUpperCase() + type.slice(1),
              hint: `${currentVersion} → ${applyBump(currentVersion, type)}`,
            })),
            { value: 'custom', label: 'Custom', hint: 'Enter an exact version number' },
          ],
          initialValue: 'patch' as string,
        });
      },

      customVersion: ({ results }) => {
        if (results.bumpType !== 'custom') return Promise.resolve(undefined as unknown as string);
        return p.text({
          message: 'Enter exact version (x.y.z)',
          placeholder: currentVersion,
          validate: (value) => {
            if (!isExactVersion(value)) return 'Must be in the form x.y.z (e.g. 1.2.3)';
            if (compareVersions(currentVersion, value) >= 0) {
              return `New version must be greater than current ${currentVersion}`;
            }
          },
        });
      },

      packages: ({ results }) => {
        const bump = results.bumpType as string;
        const next =
          bump === 'custom' ? (results.customVersion as string) : applyBump(currentVersion, bump);

        p.log.step(`New version: ${pc.green(next)}`);

        if (selectAll) {
          p.log.info(`Applying to all ${allPackages.length} packages`);
          return Promise.resolve(allPackages);
        }

        const available = pc.dim('(' + allPackages.length + ' available)');
        const preselected = changedPackages
          ? allPackages.filter((pkg) => changedPackages.has(pkg.name))
          : allPackages;

        return p.multiselect({
          message: `Select packages to update ${available}`,
          options: allPackages.map((pkg) => {
            const changed = changedPackages ? changedPackages.has(pkg.name) : true;
            const badgeSymbol = changed ? pc.green('● ') : pc.dim('○ ');
            const badge = changedPackages ? badgeSymbol : '';
            const label = badge + (changed ? pc.cyan(pkg.name) : pc.dim(pkg.name));
            const changeStatus = changed ? pc.green('changed') + '  ' : pc.dim('unchanged') + '  ';
            const changeHint = changedPackages ? changeStatus : '';
            return {
              value: pkg,
              label,
              hint: changeHint + pkg.version + ' → ' + next + '  ' + pc.dim(pkg.relativePath),
            };
          }),
          initialValues: preselected,
          required: true,
        });
      },

      confirmed: ({ results }) => {
        const bump = results.bumpType as string;
        const next =
          bump === 'custom' ? (results.customVersion as string) : applyBump(currentVersion, bump);
        const count = (results.packages as WorkspacePackage[]).length;
        return p.confirm({
          message: `Apply ${pc.green(next)} to ${pc.bold(String(count))} package${count === 1 ? '' : 's'}?`,
          initialValue: true,
        });
      },
    },
    {
      onCancel: () => {
        p.cancel('Bump cancelled.');
        throw new Error('cancelled');
      },
    }
  );

  if (!answers.confirmed) {
    p.cancel('Bump cancelled.');
    throw new Error('cancelled');
  }

  const bump = answers.bumpType;
  const nextVersion =
    bump === 'custom' ? (answers.customVersion as string) : applyBump(currentVersion, bump);

  return {
    nextVersion,
    selectedPackages: answers.packages as WorkspacePackage[],
  };
}
