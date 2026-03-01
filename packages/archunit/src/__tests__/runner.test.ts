/**
 * Tests for runner.ts – covers uncovered lines:
 * - collect() Promise branch (line 71)
 * - run() with normalizeRules (lines 17, 21, 25-35, 149-152)
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runArch } from '../runner';
import type { Buildable, Rule, Violation } from '../types';

const TEST_DIR = join(import.meta.dir, '.test-runner-fixtures');

async function setupFixtures(fixtures: Record<string, string>) {
  await mkdir(TEST_DIR, {
    recursive: true,
  });
  for (const [path, content] of Object.entries(fixtures)) {
    const fullPath = join(TEST_DIR, path);
    await mkdir(join(fullPath, '..'), {
      recursive: true,
    });
    await writeFile(fullPath, content);
  }
}

describe('runner', () => {
  afterEach(async () => {
    await rm(TEST_DIR, {
      recursive: true,
      force: true,
    });
  });

  describe('collect() with Promise<Violation[]> rules', () => {
    it('handles rules that return Promise<Violation[]> instead of AsyncIterable', async () => {
      await setupFixtures({
        'test.ts': '',
      });

      const promiseRule: Rule = {
        name: 'promise-rule',
        check: async () => {
          return [
            {
              file: 'test.ts',
              message: 'violation from promise rule',
            },
          ];
        },
      };

      const result = await runArch({
        cwd: TEST_DIR,
        rules: [promiseRule],
      });

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]?.rule).toBe('promise-rule');
      expect(result.violations[0]?.violations[0]?.message).toBe('violation from promise rule');
    });

    it('handles rules returning empty Promise<Violation[]>', async () => {
      await setupFixtures({
        'test.ts': '',
      });

      const promiseRule: Rule = {
        name: 'empty-promise-rule',
        check: async () => {
          return [];
        },
      };

      const result = await runArch({
        cwd: TEST_DIR,
        rules: [promiseRule],
      });

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('run() with normalizeRules', () => {
    it('normalizes Buildable inputs and runs them', async () => {
      await setupFixtures({
        'test.ts': '',
      });

      const rawRule: Rule = {
        name: 'built-rule',
        async *check() {
          // no violations
        },
      };

      const buildable: Buildable = {
        build: () => rawRule,
      };

      // We can't call run() directly because it calls process.exit().
      // Instead, we mock process.exit and verify the flow.
      const originalExit = process.exit;
      let exitCode: number | undefined;
      process.exit = mock((code?: number) => {
        exitCode = code ?? 0;
        // Don't actually exit
      }) as typeof process.exit;

      const { run } = await import('../runner');

      try {
        await run(buildable);
      } finally {
        process.exit = originalExit;
      }

      expect(exitCode).toBe(0);
    });

    it('normalizes raw Rule inputs', async () => {
      await setupFixtures({
        'test.ts': '',
      });

      const rawRule: Rule = {
        name: 'raw-rule',
        async *check() {
          // no violations
        },
      };

      const originalExit = process.exit;
      let exitCode: number | undefined;
      process.exit = mock((code?: number) => {
        exitCode = code ?? 0;
      }) as typeof process.exit;

      const { run } = await import('../runner');

      try {
        await run(rawRule);
      } finally {
        process.exit = originalExit;
      }

      expect(exitCode).toBe(0);
    });

    it('normalizes nested array inputs', async () => {
      await setupFixtures({
        'test.ts': '',
      });

      const rule1: Rule = {
        name: 'rule-1',
        async *check() {
          // no violations
        },
      };

      const rule2: Rule = {
        name: 'rule-2',
        async *check() {
          // no violations
        },
      };

      const originalExit = process.exit;
      let exitCode: number | undefined;
      process.exit = mock((code?: number) => {
        exitCode = code ?? 0;
      }) as typeof process.exit;

      const { run } = await import('../runner');

      try {
        // Passing as nested array (RuleInput can be Rule[])
        await run([rule1, rule2] as unknown as Rule);
      } finally {
        process.exit = originalExit;
      }

      expect(exitCode).toBe(0);
    });

    it('exits with code 1 when violations found', async () => {
      const failingRule: Rule = {
        name: 'failing-rule',
        async *check() {
          yield {
            file: 'bad.ts',
            message: 'something wrong',
          };
        },
      };

      const originalExit = process.exit;
      const originalLog = console.log;
      let exitCode: number | undefined;
      process.exit = mock((code?: number) => {
        exitCode = code ?? 0;
      }) as typeof process.exit;
      // Suppress printResult output
      console.log = mock(() => undefined);

      const { run } = await import('../runner');

      try {
        await run(failingRule);
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }

      expect(exitCode).toBe(1);
    });

    it('skips non-Rule, non-Buildable, non-array inputs gracefully', async () => {
      // normalizeRules should skip inputs that don't match any known type
      const originalExit = process.exit;
      let exitCode: number | undefined;
      process.exit = mock((code?: number) => {
        exitCode = code ?? 0;
      }) as typeof process.exit;
      // Suppress printResult output
      const originalLog = console.log;
      console.log = mock(() => undefined);

      const { run } = await import('../runner');

      try {
        // Pass something that is neither a Rule, Buildable, nor array
        await run('not-a-rule' as unknown as Rule);
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }

      // With no valid rules, nothing to check, should pass (0 rules, 0 violations)
      expect(exitCode).toBe(0);
    });
  });
});
