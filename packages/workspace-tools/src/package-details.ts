import { dirname } from 'node:path';
import { isObjectRecord } from './type-guards';

export interface PackageDetails {
  files?: string[];
  exports?: unknown;
  bin?: Record<string, string> | string;
  scripts?: Record<string, string>;
  description?: string;
  dependencyNames?: string[];
  hasReadme?: boolean;
  license?: string;
  hasRepository?: boolean;
  keywordsCount?: number;
  plugin?: PluginDetails;
}

export interface PluginDetails {
  displayName?: string;
  enginesBrika?: string;
  blocksCount?: number;
  bricksCount?: number;
  sparksCount?: number;
  pagesCount?: number;
  hasActions?: boolean;
}

const README_FILE = 'readme.md';

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((entry) => typeof entry === 'string');
  return strings.length > 0 ? strings : undefined;
}

function readStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isObjectRecord(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') out[key] = entry;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function readBin(value: unknown): PackageDetails['bin'] {
  if (typeof value === 'string') return value;
  return readStringRecord(value);
}

function readDependencyNames(pkg: Record<string, unknown> | undefined): string[] | undefined {
  const records = [
    readStringRecord(pkg?.dependencies),
    readStringRecord(pkg?.peerDependencies),
    readStringRecord(pkg?.optionalDependencies),
  ];
  const names = new Set<string>();
  for (const record of records) {
    if (!record) continue;
    for (const name of Object.keys(record)) names.add(name);
  }
  if (names.size === 0) return undefined;
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

function readArrayCount(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : undefined;
}

function hasRepositoryField(value: unknown): boolean {
  if (typeof value === 'string') return value.length > 0;
  if (!isObjectRecord(value)) return false;
  return typeof value.url === 'string' && value.url.length > 0;
}

async function hasReadmeFile(pkgPath: string): Promise<boolean> {
  const pkgDir = dirname(pkgPath);
  const entries = new Bun.Glob('*');
  for await (const entry of entries.scan({ cwd: pkgDir })) {
    if (entry.toLowerCase() === README_FILE) return true;
  }
  return false;
}

function readPluginDetails(pkg: Record<string, unknown> | undefined): PluginDetails | undefined {
  const engines = readStringRecord(pkg?.engines);
  const plugin: PluginDetails = {
    displayName: readString(pkg?.displayName),
    enginesBrika: engines?.brika,
    blocksCount: readArrayCount(pkg?.blocks),
    bricksCount: readArrayCount(pkg?.bricks),
    sparksCount: readArrayCount(pkg?.sparks),
    pagesCount: readArrayCount(pkg?.pages),
    hasActions: typeof pkg?.actions === 'string' ? true : undefined,
  };
  const hasPluginData =
    plugin.displayName !== undefined ||
    plugin.enginesBrika !== undefined ||
    plugin.blocksCount !== undefined ||
    plugin.bricksCount !== undefined ||
    plugin.sparksCount !== undefined ||
    plugin.pagesCount !== undefined ||
    plugin.hasActions !== undefined;
  return hasPluginData ? plugin : undefined;
}

export async function readPackageDetails(pkgPath: string): Promise<PackageDetails> {
  const raw = await Bun.file(pkgPath).json();
  const pkg = isObjectRecord(raw) ? raw : undefined;
  const keywords = readStringArray(pkg?.keywords);
  const hasReadme = await hasReadmeFile(pkgPath);
  return {
    files: readStringArray(pkg?.files),
    exports: pkg?.exports,
    bin: readBin(pkg?.bin),
    scripts: readStringRecord(pkg?.scripts),
    description: readString(pkg?.description),
    dependencyNames: readDependencyNames(pkg),
    hasReadme,
    license: readString(pkg?.license),
    hasRepository: hasRepositoryField(pkg?.repository),
    keywordsCount: keywords?.length,
    plugin: readPluginDetails(pkg),
  };
}
