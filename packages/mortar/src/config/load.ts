/**
 * Filesystem IO for `mortar.yml`: find, read, write. Validation lives
 * in `./validate.ts`; this file is only the disk-touching side.
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, parse as parsePath, resolve } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { CONFIG_FILENAME, DEFAULT_CONFIG_YAML } from './defaults';
import { expandServiceVars } from './expandVars';
import type { MortarConfig, ResolvedConfig } from './types';
import { validateConfig } from './validate';

/**
 * Walk up from `startDir` looking for `mortar.yml` (vite / biome / etc.
 * use the same strategy). Returns the absolute path to the first match,
 * or `null` when the walk reaches the filesystem root without finding
 * one. Each step is a single `existsSync` — even on a 20-deep nested
 * workspace that's ~20 stats, well under any user-perceptible cost.
 */
export function findConfig(startDir: string = process.cwd()): string | null {
  let dir = resolve(startDir);
  const { root: fsRoot } = parsePath(dir);
  while (true) {
    const candidate = join(dir, CONFIG_FILENAME);
    if (existsSync(candidate)) {
      return candidate;
    }
    if (dir === fsRoot) {
      return null;
    }
    dir = dirname(dir);
  }
}

/**
 * Where `init` and explicit-cwd callers write the file. No upward walk
 * — the user's `cwd` IS the intended project root in that case.
 */
export function configPath(cwd: string = process.cwd()): string {
  return join(cwd, CONFIG_FILENAME);
}

/** True when an existing `mortar.yml` is reachable from `cwd`. */
export function configExists(cwd: string = process.cwd()): boolean {
  return findConfig(cwd) !== null;
}

/**
 * Resolve, read, and validate the nearest `mortar.yml`. Throws a
 * helpful error when no config is reachable so callers can surface a
 * specific "run `mortar init`" hint instead of a stack trace.
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<ResolvedConfig> {
  const path = findConfig(cwd);
  if (!path) {
    throw new Error(
      `No mortar.yml found in ${cwd} or any parent directory. Run \`mortar init\` to create one.`
    );
  }
  const raw = await readFile(path, 'utf8');
  const root = dirname(path);
  const parsed = validateConfig(parseYaml(raw));
  const config: MortarConfig = {
    services: parsed.services.map((svc) => expandServiceVars(svc, { root })),
  };
  return { path, root, config };
}

export async function saveDefaultConfig(cwd: string = process.cwd()): Promise<string> {
  const path = configPath(cwd);
  await writeFile(path, DEFAULT_CONFIG_YAML, 'utf8');
  return path;
}

export async function saveConfig(cfg: MortarConfig, cwd: string = process.cwd()): Promise<string> {
  const services: Record<string, object> = {};
  for (const svc of cfg.services) {
    // Omit null-valued optional fields from serialized output — they're
    // the implicit defaults and serializing them as `null` would just
    // add noise to the YAML.
    const { id, url, cwd: svcCwd, port, ...rest } = svc;
    let entry: Record<string, unknown> = { ...rest };
    if (svcCwd !== null) {
      entry = { ...entry, cwd: svcCwd };
    }
    if (port !== null) {
      entry = { ...entry, port };
    }
    if (url !== null) {
      entry = { ...entry, url };
    }
    services[id] = entry;
  }
  const yaml = stringifyYaml({ services }, { indent: 2 });
  const path = configPath(cwd);
  await writeFile(path, yaml, 'utf8');
  return path;
}
