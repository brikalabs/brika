import type { Rule } from '../types';

const IMPORT_REGEX = /from\s+['"]([^'"]+)['"]/g;

/** Files matching pattern must not import from forbidden paths */
export function noImportsFrom(pattern: string, forbidden: RegExp, description: string): Rule {
  return {
    name: `"${pattern}" must not import ${description}`,
    async *check(ctx) {
      for await (const file of ctx.glob(pattern)) {
        const content = await ctx.read(file);
        for (const [, importPath] of content.matchAll(IMPORT_REGEX)) {
          if (importPath && forbidden.test(importPath)) {
            yield {
              file,
              message: `Forbidden import: "${importPath}"`,
            };
          }
        }
      }
    },
  };
}

/** Check if an import path is a local/aliased import (not a node built-in or package) */
function isLocalImport(importPath: string): boolean {
  return importPath.startsWith('.') || importPath.startsWith('@/');
}

/** Files matching pattern must only import from allowed paths */
export function onlyImportsFrom(pattern: string, allowed: RegExp, description: string): Rule {
  return {
    name: `"${pattern}" must only import ${description}`,
    async *check(ctx) {
      for await (const file of ctx.glob(pattern)) {
        const content = await ctx.read(file);
        for (const [, importPath] of content.matchAll(IMPORT_REGEX)) {
          if (!importPath || !isLocalImport(importPath)) {
            continue;
          }
          if (!allowed.test(importPath)) {
            yield {
              file,
              message: `Import not allowed: "${importPath}"`,
            };
          }
        }
      }
    },
  };
}
