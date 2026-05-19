import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { registerCheck, type Suggestion } from './registry';

const README_FILE = 'readme.md';

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function findReadmeFileName(pluginDir: string): Promise<string | undefined> {
  try {
    const entries = await readdir(pluginDir, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase() === README_FILE) {
        return entry.name;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function normalizePublishPath(path: string): string {
  let normalized = path.trim().replaceAll('\\', '/').toLowerCase();
  while (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }
  while (normalized.startsWith('/')) {
    normalized = normalized.slice(1);
  }
  while (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function isDirectoryLikePath(path: string): boolean {
  const lastSlash = path.lastIndexOf('/');
  const leaf = lastSlash === -1 ? path : path.slice(lastSlash + 1);
  return !leaf.includes('.');
}

function patternBase(path: string, suffix: string): string | undefined {
  if (!path.endsWith(suffix)) {
    return undefined;
  }
  const base = path.slice(0, -suffix.length);
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

function filesEntryCoversPath(entry: string, requiredPath: string): boolean {
  const normalizedEntry = normalizePublishPath(entry);
  const normalizedRequiredPath = normalizePublishPath(requiredPath);
  if (normalizedEntry.length === 0 || normalizedEntry.startsWith('!')) {
    return false;
  }
  if (normalizedEntry === normalizedRequiredPath) {
    return true;
  }

  const deepWildcardBase = patternBase(normalizedEntry, '/**');
  if (deepWildcardBase) {
    return (
      normalizedRequiredPath === deepWildcardBase ||
      normalizedRequiredPath.startsWith(`${deepWildcardBase}/`)
    );
  }

  const singleWildcardBase = patternBase(normalizedEntry, '/*');
  if (singleWildcardBase) {
    return normalizedRequiredPath.startsWith(`${singleWildcardBase}/`);
  }

  if (isDirectoryLikePath(normalizedEntry)) {
    return normalizedRequiredPath.startsWith(`${normalizedEntry}/`);
  }

  return false;
}

function filesIncludePath(files: string[], requiredPath: string): boolean {
  return files.some((file) => filesEntryCoversPath(file, requiredPath));
}

const ICON_MISSING_WARNING = 'icon is missing — add e.g. "icon": "./icon.svg"';

async function collectExpectedPaths(pluginDir: string, icon: string | undefined): Promise<string[]> {
  const expected: string[] = [];
  if (await pathExists(resolve(pluginDir, 'src'))) {
    expected.push('src');
  }
  if (await pathExists(resolve(pluginDir, 'locales'))) {
    expected.push('locales');
  }
  const readmeFileName = await findReadmeFileName(pluginDir);
  if (readmeFileName) {
    expected.push(readmeFileName);
  }
  if (icon) {
    expected.push(icon);
  }
  return expected;
}

function mergeUnique(...lists: readonly (readonly string[])[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const entry of list) {
      if (!seen.has(entry)) {
        merged.push(entry);
        seen.add(entry);
      }
    }
  }
  return merged;
}

registerCheck(async ({ pkg, pluginDir }) => {
  const warnings: string[] = [];
  const suggestions: Suggestion[] = [];
  const { icon, files = [] } = pkg;

  const expectedPublishPaths = await collectExpectedPaths(pluginDir, icon);

  if (!icon) {
    warnings.push(ICON_MISSING_WARNING);
    suggestions.push({
      for: ICON_MISSING_WARNING,
      description: 'Declare an icon path (PNG/SVG, relative to the plugin root)',
      snippet: `"icon": "./icon.svg"`,
      language: 'json',
    });
  } else if (!(await pathExists(resolve(pluginDir, icon)))) {
    warnings.push(`icon path "${icon}" is declared but missing on disk`);
  }

  const missing = expectedPublishPaths.filter((p) => !filesIncludePath(files, p));
  if (missing.length > 0) {
    const message = `files should include publish paths: ${missing.join(', ')}`;
    warnings.push(message);
    suggestions.push({
      for: message,
      description: 'Add the missing publish paths to the files array',
      snippet: `"files": ${JSON.stringify(mergeUnique(files, missing))}`,
      language: 'json',
    });
  }

  return {
    warnings,
    suggestions,
  };
});
