import { join } from 'node:path';

export interface ValidationDiagnostic {
  level: 'error' | 'warning';
  message: string;
  file?: string;
}

export interface ValidationResult {
  ok: boolean;
  diagnostics: ValidationDiagnostic[];
}

interface PluginMetadata {
  bricks?: Array<{ id: string }>;
  pages?: Array<{ id: string }>;
}

/** IDs must not contain path traversal characters */
function isSafeId(id: string): boolean {
  return id.length > 0 && !id.includes('/') && !id.includes('\\') && !id.includes('..');
}

/** Verify declared items have matching source files */
async function checkDeclaredSources(
  pluginRoot: string,
  items: Array<{ id: string }>,
  kind: 'bricks' | 'pages',
  diagnostics: ValidationDiagnostic[],
): Promise<void> {
  const label = kind === 'bricks' ? 'Brick' : 'Page';
  for (const item of items) {
    if (!isSafeId(item.id)) {
      diagnostics.push({ level: 'error', message: `${label} ID "${item.id}" contains unsafe characters` });
      continue;
    }
    const path = join(pluginRoot, 'src', kind, `${item.id}.tsx`);
    if (!(await Bun.file(path).exists())) {
      diagnostics.push({
        level: 'error',
        message: `${label} "${item.id}" declared in package.json but src/${kind}/${item.id}.tsx not found`,
        file: path,
      });
    }
  }
}

/** Warn about source files not declared in metadata */
async function checkUndeclaredFiles(
  pluginRoot: string,
  declaredIds: ReadonlySet<string>,
  kind: 'bricks' | 'pages',
  diagnostics: ValidationDiagnostic[],
): Promise<void> {
  try {
    const glob = new Bun.Glob(`src/${kind}/*.tsx`);
    for await (const path of glob.scan({ cwd: pluginRoot })) {
      const id = path.replace(`src/${kind}/`, '').replace('.tsx', '');
      if (!declaredIds.has(id)) {
        diagnostics.push({
          level: 'warning',
          message: `File src/${kind}/${id}.tsx exists but "${id}" is not declared in package.json ${kind}`,
          file: join(pluginRoot, path),
        });
      }
    }
  } catch {
    // Directory may not exist
  }
}

/**
 * Build-time validation of plugin structure.
 * Checks that declared bricks/pages have matching source files.
 */
export async function validatePlugin(
  pluginRoot: string,
  metadata: PluginMetadata,
): Promise<ValidationResult> {
  const diagnostics: ValidationDiagnostic[] = [];

  const bricks = metadata.bricks ?? [];
  const pages = metadata.pages ?? [];

  await checkDeclaredSources(pluginRoot, bricks, 'bricks', diagnostics);
  await checkDeclaredSources(pluginRoot, pages, 'pages', diagnostics);

  await checkUndeclaredFiles(pluginRoot, new Set(bricks.map((b) => b.id)), 'bricks', diagnostics);
  await checkUndeclaredFiles(pluginRoot, new Set(pages.map((p) => p.id)), 'pages', diagnostics);

  return {
    ok: diagnostics.every((d) => d.level !== 'error'),
    diagnostics,
  };
}
