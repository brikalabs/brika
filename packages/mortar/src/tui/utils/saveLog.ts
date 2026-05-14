/**
 * Save log lines to a file under `<projectRoot>/.mortar-logs/`.
 * Returns the absolute path on success. Strips ANSI color codes so
 * the file is plain text — raw `\x1b[...m` bytes in a non-color-aware
 * viewer would be noise.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stripAnsiForFile } from './ansi';

export async function saveLogsToFile(
  serviceId: string,
  lines: ReadonlyArray<string>,
  projectRoot: string
): Promise<string> {
  const dir = join(projectRoot, '.mortar-logs');
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = join(dir, `${serviceId}-${stamp}.log`);
  const cleaned = lines.map(stripAnsiForFile).join('\n');
  await writeFile(path, `${cleaned}\n`, 'utf8');
  return path;
}
