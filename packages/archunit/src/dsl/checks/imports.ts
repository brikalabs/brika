import { registerCheck } from '../file-rule';

declare module '../file-rule' {
  interface FileRule {
    /** Files should not import from a pattern */
    notImportFrom(pattern: RegExp, description?: string): this;
    /** Files should only import from allowed patterns */
    onlyImportFrom(pattern: RegExp, description?: string): this;
    /** Exports should match a pattern */
    haveExportsMatching(pattern: RegExp, description?: string): this;
  }
}

registerCheck('notImportFrom', (pattern: RegExp, description?: string) => {
  const desc = description ?? pattern.source;
  return {
    name: `not import ${desc}`,
    check: (_, file, content) => {
      for (const match of content.matchAll(/import\s+.*?from\s+['"]([^'"]+)['"]/g)) {
        const imported = match[1];
        if (imported && pattern.test(imported)) {
          const line = content.substring(0, match.index).split('\n').length;
          return { file, line, message: `Forbidden import: ${imported}` };
        }
      }
    },
  };
});

registerCheck('onlyImportFrom', (pattern: RegExp, description?: string) => {
  const desc = description ?? pattern.source;
  return {
    name: `only import ${desc}`,
    check: (_, file, content) => {
      for (const match of content.matchAll(/import\s+.*?from\s+['"]([^'"]+)['"]/g)) {
        const imported = match[1];
        if (imported && !pattern.test(imported)) {
          const line = content.substring(0, match.index).split('\n').length;
          return { file, line, message: `Import not allowed: ${imported}` };
        }
      }
    },
  };
});

registerCheck('haveExportsMatching', (pattern: RegExp, description?: string) => {
  const desc = description ?? `matching ${pattern.source}`;
  return {
    name: `exports ${desc}`,
    check: (_, file, content) => {
      for (const [, name] of content.matchAll(/export\s+(?:function|const|class)\s+(\w+)/g)) {
        if (name && !pattern.test(name)) {
          return { file, message: `Export "${name}" doesn't match` };
        }
      }
    },
  };
});
