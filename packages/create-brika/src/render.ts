/**
 * Generic file-based scaffold engine.
 *
 * Template directory conventions:
 *   .tpl            → text template (rendered with data)
 *   .ts             → TypeScript generator (default export → string)
 *   [condition]dir/ → conditional folder (only created when data[condition] is truthy)
 *   {{key}}         → variable interpolation in filenames
 *   _gitignore      → renamed to .gitignore
 *   other files     → copied as-is
 *
 * Template syntax (inside .tpl files):
 *   {{key}}              — variable interpolation
 *   {{#key}}...{{/key}}  — conditional block (included when data[key] is truthy)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export type TemplateData = Record<string, string | boolean>;

// ─── Template rendering ──────────────────────────────────────────────────────

/** Render a template string: process conditionals, interpolate variables, clean up. */
export function render(template: string, data: TemplateData): string {
  // 1. Conditional blocks: {{#key}}...{{/key}}
  let result = template.replaceAll(
    /\{\{#(\w+)\}\}\n?([\s\S]*?)\{\{\/\1\}\}\n?/g,
    (_, key, content) => (data[key] ? content : '')
  );

  // 2. Variable interpolation: {{key}}
  result = result.replaceAll(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = data[key];
    return typeof val === 'string' ? val : '';
  });

  // 3. Collapse excessive blank lines
  result = result.replaceAll(/\n{3,}/g, '\n\n');

  return result;
}

// ─── Filename resolution ─────────────────────────────────────────────────────

const FILE_RENAMES: Record<string, string> = {
  _gitignore: '.gitignore',
};

/** Resolve a template filename: strip .tpl/.ts, interpolate {{key}}, apply renames. */
export function resolveFilename(name: string, data: TemplateData): string {
  if (name.endsWith('.tpl')) {
    name = name.slice(0, -4);
  } else if (name.endsWith('.ts')) {
    name = name.slice(0, -3);
  }
  name = name.replaceAll(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = data[key];
    return typeof val === 'string' ? val : '';
  });
  return FILE_RENAMES[name] ?? name;
}

/** Parse [condition] prefix from a directory name. */
export function parseCondition(name: string): {
  name: string;
  condition?: string;
} {
  const match = /^\[(\w+)\](.+)$/.exec(name);
  if (match) {
    return {
      name: match[2],
      condition: match[1],
    };
  }
  return {
    name,
  };
}

// ─── Directory walker ────────────────────────────────────────────────────────

/** Walk a template directory, process all files, write to target. */
export async function walkTemplate(
  templateDir: string,
  targetDir: string,
  data: TemplateData
): Promise<void> {
  await fs.mkdir(targetDir, {
    recursive: true,
  });
  const entries = await fs.readdir(templateDir, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    const srcPath = path.join(templateDir, entry.name);

    if (entry.isDirectory()) {
      const { name: dirName, condition } = parseCondition(entry.name);
      if (condition && !data[condition]) {
        continue;
      }

      await walkTemplate(srcPath, path.join(targetDir, dirName), data);
    } else if (entry.name.endsWith('.ts')) {
      // Generator: import + call default export → string
      const mod = await import(srcPath);
      const content: string = mod.default(data);
      await fs.writeFile(path.join(targetDir, resolveFilename(entry.name, data)), content);
    } else if (entry.name.endsWith('.tpl')) {
      // Template: render with data
      const raw = await fs.readFile(srcPath, 'utf-8');
      const content = render(raw, data);
      await fs.writeFile(path.join(targetDir, resolveFilename(entry.name, data)), content);
    } else {
      // Plain file: copy with filename resolution
      await fs.copyFile(srcPath, path.join(targetDir, resolveFilename(entry.name, data)));
    }
  }
}
