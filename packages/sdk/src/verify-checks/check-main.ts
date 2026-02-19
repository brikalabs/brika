import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { registerCheck } from './registry';

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

registerCheck(async ({ pkg, pluginDir }) => {
  if (!(await pathExists(resolve(pluginDir, pkg.main)))) {
    return { errors: [`main path "${pkg.main}" is declared but missing on disk`] };
  }
  return {};
});
