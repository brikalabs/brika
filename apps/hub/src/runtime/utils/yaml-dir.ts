/**
 * Shared YAML directory helpers
 *
 * Extracted from WorkflowLoader / BoardLoader to eliminate duplication.
 */

import { join } from 'node:path';

export interface YamlDirLogger {
  info(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Ensure a directory exists and return the list of YAML file paths inside it.
 *
 * Creates a `.keep` sentinel if the directory doesn't exist yet.
 */
export async function ensureAndScanYamlDir(
  dir: string,
  logs: YamlDirLogger,
  entityLabel: string
): Promise<string[]> {
  // Ensure directory exists
  try {
    await Array.fromAsync(new Bun.Glob('*').scan({ cwd: dir }));
  } catch {
    await Bun.write(`${dir}/.keep`, '');
    logs.info(`${entityLabel} directory created`, { directory: dir });
  }

  // Scan for YAML files and return absolute paths
  const files = await Array.fromAsync(new Bun.Glob('*.{yaml,yml}').scan({ cwd: dir }));
  return files.map((file) => join(dir, file));
}
