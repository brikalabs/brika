import { Glob } from 'bun';
import chalk from 'chalk';
import { normalizeRules } from './normalize';
import type { ArchConfig, ArchResult, Rule, RuleContext, RuleInput, Violation } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

function createContext(cwd: string, scannedFiles: Set<string>): RuleContext {
  const resolve = (path: string) => `${cwd}/${path}`;

  return {
    cwd,
    async *glob(pattern) {
      const isDir = pattern.endsWith('/') || (pattern.endsWith('*') && !pattern.includes('.'));
      const cleanPattern = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern;
      for await (const file of new Glob(cleanPattern).scan({ cwd, onlyFiles: !isDir })) {
        scannedFiles.add(file);
        yield file;
      }
    },
    read: (path) => Bun.file(resolve(path)).text(),
    exists: (path) => Bun.file(resolve(path)).exists(),
    lines: async (path) => (await Bun.file(resolve(path)).text()).split('\n').length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function collect<T>(iter: AsyncIterable<T> | Promise<T[]>): Promise<T[]> {
  if (Symbol.asyncIterator in iter) {
    const items: T[] = [];
    for await (const item of iter) items.push(item);
    return items;
  }
  return iter;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

export async function runArch(config: ArchConfig): Promise<ArchResult> {
  const start = performance.now();
  const scannedFiles = new Set<string>();
  const ctx = createContext(config.cwd ?? process.cwd(), scannedFiles);
  const results: { rule: string; violations: Violation[] }[] = [];

  const checks = await Promise.all(
    config.rules.map(async (rule) => ({
      rule,
      violations: await collect(rule.check(ctx)),
    }))
  );

  for (const { rule, violations } of checks) {
    if (violations.length === 0) continue;
    results.push({ rule: rule.name, violations });
  }

  return {
    passed: results.length === 0,
    violations: results,
    elapsed: performance.now() - start,
    rulesChecked: config.rules.length,
    filesScanned: scannedFiles.size,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────────────────────────────────────

export function printResult(result: ArchResult): void {
  if (result.passed) {
    console.log(
      chalk.green(`✓ All ${result.rulesChecked} rules passed`) +
        chalk.dim(` (${result.filesScanned} files in ${result.elapsed.toFixed(1)}ms)`)
    );
    return;
  }

  console.log(`\n${chalk.red('✗')} ${chalk.bold('Architecture violations:')}\n`);

  for (const { rule, violations } of result.violations) {
    const countLabel = chalk.dim(`(${violations.length})`);
    console.log(`  ${chalk.bold(rule)} ${countLabel}`);
    for (const v of violations) {
      const loc = v.line ? chalk.dim(`:${v.line}`) : '';
      const hint = v.suggestion ? chalk.dim(` → ${v.suggestion}`) : '';
      console.log(`    ${chalk.red('•')} ${v.file}${loc}: ${v.message}${hint}`);
    }
    console.log();
  }

  const total = result.violations.reduce((sum, r) => sum + r.violations.length, 0);
  console.log(
    chalk.dim(
      `${total} violation(s) · ${result.filesScanned} files · ${result.elapsed.toFixed(1)}ms\n`
    )
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

/** Define architecture rules (Vite-style) */
export function defineConfig(rules: RuleInput[]): RuleInput[] {
  return rules;
}

export async function run(...inputs: RuleInput[]): Promise<void> {
  const rules = normalizeRules(inputs);
  const result = await runArch({ rules });
  printResult(result);
  process.exit(result.passed ? 0 : 1);
}
