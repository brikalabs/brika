/**
 * Tests for archunit rule functions
 */
import { describe, expect, test } from 'bun:test';
import { maxLines, requiredFiles } from '../rules/files';
import { noImportsFrom, onlyImportsFrom } from '../rules/imports';
import { camelCase, kebabCase, pascalCase } from '../rules/naming';
import { exportsMatch, mustContain, noPattern } from '../rules/patterns';
import type { Rule, RuleContext, Violation } from '../types';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createMockContext(files: Record<string, string>): RuleContext {
  return {
    cwd: '/test',
    async *glob(_pattern: string) {
      for (const path of Object.keys(files)) {
        yield path;
      }
    },
    async read(file: string) {
      return files[file] ?? '';
    },
    async lines(file: string) {
      return (files[file] ?? '').split('\n').length;
    },
    async exists(path: string) {
      return path in files;
    },
  };
}

async function collectViolations(rule: Rule, ctx: RuleContext): Promise<Violation[]> {
  const violations: Violation[] = [];
  const result = rule.check(ctx);
  if (Symbol.asyncIterator in result) {
    for await (const v of result) violations.push(v);
  } else {
    violations.push(...(await result));
  }
  return violations;
}

// ─── Naming Rules ────────────────────────────────────────────────────────────

describe('naming rules', () => {
  describe('pascalCase', () => {
    test('passes for PascalCase file names', async () => {
      const ctx = createMockContext({ 'src/MyComponent.tsx': '' });
      const violations = await collectViolations(pascalCase('**/*.tsx'), ctx);
      expect(violations).toHaveLength(0);
    });

    test('fails for non-PascalCase file names', async () => {
      const ctx = createMockContext({ 'src/my-component.tsx': '' });
      const violations = await collectViolations(pascalCase('**/*.tsx'), ctx);
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain('not PascalCase');
    });

    test('fails for camelCase file names', async () => {
      const ctx = createMockContext({ 'src/myComponent.tsx': '' });
      const violations = await collectViolations(pascalCase('**/*.tsx'), ctx);
      expect(violations).toHaveLength(1);
    });

    test('rule has descriptive name', () => {
      const rule = pascalCase('**/*.tsx');
      expect(rule.name).toContain('PascalCase');
    });
  });

  describe('camelCase', () => {
    test('passes for camelCase file names', async () => {
      const ctx = createMockContext({ 'src/myUtils.ts': '' });
      const violations = await collectViolations(camelCase('**/*.ts'), ctx);
      expect(violations).toHaveLength(0);
    });

    test('fails for PascalCase file names', async () => {
      const ctx = createMockContext({ 'src/MyUtils.ts': '' });
      const violations = await collectViolations(camelCase('**/*.ts'), ctx);
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain('not camelCase');
    });
  });

  describe('kebabCase', () => {
    test('passes for kebab-case file names', async () => {
      const ctx = createMockContext({ 'src/my-component.tsx': '' });
      const violations = await collectViolations(kebabCase('**/*.tsx'), ctx);
      expect(violations).toHaveLength(0);
    });

    test('fails for PascalCase file names', async () => {
      const ctx = createMockContext({ 'src/MyComponent.tsx': '' });
      const violations = await collectViolations(kebabCase('**/*.tsx'), ctx);
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain('not kebab-case');
    });

    test('passes for single word', async () => {
      const ctx = createMockContext({ 'src/utils.ts': '' });
      const violations = await collectViolations(kebabCase('**/*.ts'), ctx);
      expect(violations).toHaveLength(0);
    });

    test('fails for names with underscores', async () => {
      const ctx = createMockContext({ 'src/my_component.tsx': '' });
      const violations = await collectViolations(kebabCase('**/*.tsx'), ctx);
      expect(violations).toHaveLength(1);
    });
  });
});

// ─── Pattern Rules ───────────────────────────────────────────────────────────

describe('pattern rules', () => {
  describe('exportsMatch', () => {
    test('passes when exports match pattern', async () => {
      const ctx = createMockContext({
        'src/service.ts': 'export function fetchData() {}\nexport const apiClient = {};',
      });
      const rule = exportsMatch('**/*.ts', /^[a-z]/, 'start with lowercase');
      const violations = await collectViolations(rule, ctx);
      expect(violations).toHaveLength(0);
    });

    test('fails when exports do not match pattern', async () => {
      const ctx = createMockContext({
        'src/service.ts': 'export function FetchData() {}',
      });
      const rule = exportsMatch('**/*.ts', /^[a-z]/, 'start with lowercase');
      const violations = await collectViolations(rule, ctx);
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain('FetchData');
    });
  });

  describe('noPattern', () => {
    test('passes when pattern is not found', async () => {
      const ctx = createMockContext({
        'src/clean.ts': 'const x = 1;\n',
      });
      const rule = noPattern('**/*.ts', /console\.log/, 'console.log');
      const violations = await collectViolations(rule, ctx);
      expect(violations).toHaveLength(0);
    });

    test('fails when pattern is found', async () => {
      const ctx = createMockContext({
        'src/debug.ts': 'console.log("debug");\n',
      });
      const rule = noPattern('**/*.ts', /console\.log/, 'console.log');
      const violations = await collectViolations(rule, ctx);
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain('console.log');
    });

    test('reports line number for violations', async () => {
      const ctx = createMockContext({
        'src/file.ts': 'line1\nline2\nconsole.log("bad")\n',
      });
      const rule = noPattern('**/*.ts', /console\.log/, 'console.log');
      const violations = await collectViolations(rule, ctx);
      expect(violations[0].line).toBe(3);
    });
  });

  describe('mustContain', () => {
    test('passes when pattern is found', async () => {
      const ctx = createMockContext({
        'src/module.ts': 'export default function main() {}\n',
      });
      const rule = mustContain('**/*.ts', /export default/, 'default export');
      const violations = await collectViolations(rule, ctx);
      expect(violations).toHaveLength(0);
    });

    test('fails when pattern is missing', async () => {
      const ctx = createMockContext({
        'src/module.ts': 'export function helper() {}\n',
      });
      const rule = mustContain('**/*.ts', /export default/, 'default export');
      const violations = await collectViolations(rule, ctx);
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain('Missing');
    });
  });
});

// ─── Import Rules ────────────────────────────────────────────────────────────

describe('import rules', () => {
  describe('noImportsFrom', () => {
    test('passes when no forbidden imports exist', async () => {
      const ctx = createMockContext({
        'src/app.ts': "import { foo } from './utils';\nimport { bar } from 'lodash';\n",
      });
      const rule = noImportsFrom('**/*.ts', /node:fs/, 'node:fs');
      const violations = await collectViolations(rule, ctx);
      expect(violations).toHaveLength(0);
    });

    test('fails when forbidden import is found', async () => {
      const ctx = createMockContext({
        'src/app.ts': "import { readFile } from 'node:fs';\n",
      });
      const rule = noImportsFrom('**/*.ts', /node:fs/, 'node:fs');
      const violations = await collectViolations(rule, ctx);
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain('node:fs');
    });
  });

  describe('onlyImportsFrom', () => {
    test('passes when all relative imports match allowed pattern', async () => {
      const ctx = createMockContext({
        'src/app.ts': "import { foo } from './utils';\nimport { bar } from 'react';\n",
      });
      const rule = onlyImportsFrom('**/*.ts', /^\.\/utils/, 'utils module');
      const violations = await collectViolations(rule, ctx);
      expect(violations).toHaveLength(0);
    });

    test('fails when relative imports do not match allowed pattern', async () => {
      const ctx = createMockContext({
        'src/app.ts': "import { foo } from './forbidden';\n",
      });
      const rule = onlyImportsFrom('**/*.ts', /^\.\/utils/, 'utils module');
      const violations = await collectViolations(rule, ctx);
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain('./forbidden');
    });

    test('ignores non-relative package imports', async () => {
      const ctx = createMockContext({
        'src/app.ts': "import React from 'react';\nimport { z } from 'zod';\n",
      });
      const rule = onlyImportsFrom('**/*.ts', /^\.\/allowed/, 'allowed only');
      const violations = await collectViolations(rule, ctx);
      expect(violations).toHaveLength(0);
    });
  });
});

// ─── File Rules ──────────────────────────────────────────────────────────────

describe('file rules', () => {
  describe('maxLines', () => {
    test('passes when file is within limit', async () => {
      const ctx = createMockContext({
        'src/short.ts': 'line1\nline2\nline3\n',
      });
      const rule = maxLines('**/*.ts', 100);
      const violations = await collectViolations(rule, ctx);
      expect(violations).toHaveLength(0);
    });

    test('fails when file exceeds limit', async () => {
      const lines = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join('\n');
      const ctx = createMockContext({
        'src/long.ts': lines,
      });
      const rule = maxLines('**/*.ts', 100);
      const violations = await collectViolations(rule, ctx);
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain('200 lines');
      expect(violations[0].suggestion).toBe('Split into smaller files');
    });
  });

  describe('requiredFiles', () => {
    function createDirContext(dirs: string[], existingFiles: Set<string>): RuleContext {
      return {
        cwd: '/test',
        async *glob() {
          for (const d of dirs) yield d;
        },
        async read() {
          return '';
        },
        async lines() {
          return 0;
        },
        async exists(path: string) {
          return existingFiles.has(path);
        },
      };
    }

    test('passes when all required files exist', async () => {
      const ctx = createDirContext(
        ['src/features/auth/'],
        new Set(['src/features/auth/index.ts', 'src/features/auth/types.ts'])
      );
      const rule = requiredFiles('src/features/*/', ['index.ts', 'types.ts']);
      const violations = await collectViolations(rule, ctx);
      expect(violations).toHaveLength(0);
    });

    test('fails when required file is missing', async () => {
      const ctx = createDirContext(['src/features/auth/'], new Set(['src/features/auth/index.ts']));
      const rule = requiredFiles('src/features/*/', ['index.ts', 'types.ts']);
      const violations = await collectViolations(rule, ctx);
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toContain('types.ts');
    });
  });
});
