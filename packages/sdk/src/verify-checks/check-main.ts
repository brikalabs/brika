import { stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { registerCheck, type Suggestion } from './registry';

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Looks for likely entrypoint candidates next to the declared main path.
 * For example, if the declared main is `./src/index.ts` but only
 * `./src/index.tsx` exists, this returns `./src/index.tsx`.
 */
async function findLikelyEntry(pluginDir: string, declaredMain: string): Promise<string | null> {
  // Strip leading ./ for clean joining, keep the prefix for the suggestion.
  const normalized = declaredMain.replace(/^\.\//, '');
  const dotIndex = normalized.lastIndexOf('.');
  const base = dotIndex === -1 ? normalized : normalized.slice(0, dotIndex);
  // Common plugin entry extensions in priority order.
  const candidates = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
  for (const ext of candidates) {
    const candidateRel = `./${base}${ext}`;
    if (candidateRel === declaredMain) {
      continue;
    }
    if (await pathExists(resolve(pluginDir, candidateRel))) {
      return candidateRel;
    }
  }
  return null;
}

registerCheck(async ({ pkg, pluginDir }) => {
  if (await pathExists(resolve(pluginDir, pkg.main))) {
    return {};
  }

  const message = `main path "${pkg.main}" is declared but missing on disk`;
  const likely = await findLikelyEntry(pluginDir, pkg.main);

  let suggestion: Suggestion;
  if (likely) {
    suggestion = {
      for: message,
      description: `Point main at the existing file "${likely}"`,
      snippet: `"main": "${likely}"`,
      language: 'json',
    };
  } else {
    suggestion = {
      for: message,
      description: `Create the file at "${pkg.main}" (relative to ${dirname(pkg.main) || '.'})`,
      snippet: `"main": "${pkg.main}"`,
      language: 'json',
    };
  }

  return {
    errors: [message],
    suggestions: [suggestion],
  };
});
