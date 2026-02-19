import pc from 'picocolors';
import type { PackageDetails, PluginDetails } from './package-details';
import { plurals } from './plurals';

const EXPORT_PATH_FORMS = { '=0': 'no paths', one: '# path', other: '# paths' };
const BLOCK_FORMS = { one: '# block', other: '# blocks' };
const BRICK_FORMS = { one: '# brick', other: '# bricks' };
const SPARK_FORMS = { one: '# spark', other: '# sparks' };
const PAGE_FORMS = { one: '# page', other: '# pages' };
const WARNING_FORMS = { one: '# warning', other: '# warnings' };

function getPackageWarnings(details: PackageDetails): string[] {
  const warnings: string[] = [];
  if (!details.hasReadme) warnings.push('README.md missing');
  if (!details.license) warnings.push('license missing');
  if (!details.hasRepository) warnings.push('repository missing');
  const hasKeywords =
    typeof details.keywordsCount === 'number' &&
    Number.isFinite(details.keywordsCount) &&
    details.keywordsCount > 0;
  if (!hasKeywords) warnings.push('keywords missing');
  if (details.plugin && !details.plugin.enginesBrika) warnings.push('engines.brika missing');
  return warnings;
}

function detailLine(label: string, value: string): string {
  const paddedLabel = `${label}:`.padEnd(10, ' ');
  return `    ${pc.dim(paddedLabel)}${value}`;
}

function pushWhenValue(lines: string[], label: string, value: string | undefined): void {
  if (value === undefined || value.length === 0) return;
  lines.push(detailLine(label, value));
}

function warningLines(warnings: string[]): string[] {
  const warningCount = warnings.length;
  const warningLabel = plurals(WARNING_FORMS, warningCount);
  const warningSummary = `⚠ ${warningLabel}`;
  const lines = [`    ${pc.yellow(warningSummary)}`];
  for (const warning of warnings) {
    lines.push(`      ${pc.yellow('•')} ${pc.yellow(warning)}`);
  }
  return lines;
}

function buildPluginFeatures(plugin: PluginDetails): string[] {
  const features: string[] = [];
  if (typeof plugin.blocksCount === 'number' && plugin.blocksCount > 0) {
    features.push(plurals(BLOCK_FORMS, plugin.blocksCount));
  }
  if (typeof plugin.bricksCount === 'number' && plugin.bricksCount > 0) {
    features.push(plurals(BRICK_FORMS, plugin.bricksCount));
  }
  if (typeof plugin.sparksCount === 'number' && plugin.sparksCount > 0) {
    features.push(plurals(SPARK_FORMS, plugin.sparksCount));
  }
  if (typeof plugin.pagesCount === 'number' && plugin.pagesCount > 0) {
    features.push(plurals(PAGE_FORMS, plugin.pagesCount));
  }
  if (plugin.hasActions) features.push('actions');
  return features;
}

export function formatPackageLabel(name: string, version: string): string {
  const versionLabel = `@${version}`;
  return `${pc.cyan(pc.bold(name))}${pc.dim(versionLabel)}`;
}

/**
 * Returns the number of named export paths in a package's `exports` field.
 */
export function countExports(exports: unknown): number {
  if (!exports || typeof exports !== 'object') return 1;
  return Object.keys(exports).length;
}

/**
 * Returns the bin entry names for a package.
 * Handles both string shorthand and object form.
 */
export function getBinNames(name: string, bin: PackageDetails['bin']): string[] {
  if (!bin) return [];
  if (typeof bin === 'string') return [name];
  return Object.keys(bin);
}

/**
 * Returns the lifecycle hook names that are defined for a package.
 */
export function getHooks(scripts: PackageDetails['scripts']): string[] {
  if (!scripts) return [];
  const hooks: string[] = [];
  if (scripts.prepublishOnly) hooks.push('prepublishOnly');
  if (scripts.build) hooks.push('build');
  return hooks;
}

/**
 * Formats the npm registry status relative to the local version.
 *   null             → never published
 *   same as local    → already at this version (warn)
 *   older than local → shows the published version (normal)
 */
export function formatNpmStatus(localVersion: string, publishedVersion: string | null): string {
  if (publishedVersion === null) return pc.cyan('not yet published');
  if (publishedVersion === localVersion) return pc.yellow('already published — will overwrite');
  return publishedVersion;
}

/**
 * Builds a short npm hint used in package selection.
 */
export function formatNpmHint(publishedVersion: string | null): string {
  if (publishedVersion === null) return `${pc.dim('npm: ')}${pc.cyan('new')}`;
  return `${pc.dim('npm: ')}${publishedVersion}`;
}

/**
 * Builds a formatted terminal preview block for a package about to be published.
 * Returns a plain string (ANSI-colored) ready to be printed with console.log.
 *
 * @param publishedVersion - Latest version on npm, or null if not published. Omit to skip the npm line.
 */
export function formatPackagePreview(
  name: string,
  version: string,
  details: PackageDetails,
  publishedVersion?: string | null,
  extraWarnings: string[] = []
): string {
  const lines: string[] = [];
  lines.push(`  ${formatPackageLabel(name, version)}`);

  const pluginDetails = details.plugin;
  const pluginFeatures = pluginDetails ? buildPluginFeatures(pluginDetails) : [];
  const warnings = getPackageWarnings(details);
  const mergedWarnings = [...warnings, ...extraWarnings];
  const uniqueWarnings = Array.from(new Set(mergedWarnings));
  if (uniqueWarnings.length > 0) {
    lines.push(...warningLines(uniqueWarnings));
  }

  if (details.description) {
    lines.push(`    ${pc.dim(details.description)}`);
  }

  if (pluginDetails) {
    lines.push(detailLine('plugin', pc.green('yes')));
    pushWhenValue(lines, 'display', pluginDetails.displayName);
    pushWhenValue(lines, 'brika', pluginDetails.enginesBrika);
    const pluginFeaturesLabel = pluginFeatures.length > 0 ? pluginFeatures.join(', ') : undefined;
    pushWhenValue(lines, 'features', pluginFeaturesLabel);
  }

  const binNames = getBinNames(name, details.bin);
  const hooks = getHooks(details.scripts);
  if (publishedVersion !== undefined) {
    pushWhenValue(lines, 'npm', formatNpmStatus(version, publishedVersion));
  }
  const filesLabel =
    details.files && details.files.length > 0 ? details.files.join(', ') : undefined;
  pushWhenValue(lines, 'files', filesLabel);
  if (details.exports !== undefined) {
    pushWhenValue(lines, 'exports', plurals(EXPORT_PATH_FORMS, countExports(details.exports)));
  }
  const binLabel = binNames.length > 0 ? binNames.join(', ') : undefined;
  pushWhenValue(lines, 'bin', binLabel);
  const hooksLabel = hooks.length > 0 ? pc.green(`${hooks.join(', ')} ✓`) : undefined;
  pushWhenValue(lines, 'hooks', hooksLabel);

  return lines.join('\n');
}
