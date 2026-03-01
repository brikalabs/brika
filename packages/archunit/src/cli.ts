#!/usr/bin/env bun
import { resolve } from 'node:path';
import chalk from 'chalk';
import { clearRegistry, getRegisteredRules } from './registry';
import { printResult, runArch } from './runner';
import type { Buildable, Rule, RuleInput } from './types';

const CONFIG_FILES = ['arch.config.ts', 'arch.config.js'];

function isBuildable(input: RuleInput): input is Buildable {
  return typeof input === 'object' && 'build' in input && typeof input.build === 'function';
}

function isRule(input: RuleInput): input is Rule {
  return typeof input === 'object' && 'check' in input && typeof input.check === 'function';
}

function normalizeRules(inputs: RuleInput[]): Rule[] {
  const result: Rule[] = [];
  for (const input of inputs) {
    if (Array.isArray(input)) {
      result.push(...normalizeRules(input));
    } else if (isBuildable(input)) {
      result.push(input.build());
    } else if (isRule(input)) {
      result.push(input);
    }
  }
  return result;
}

async function findConfig(cwd: string): Promise<string | null> {
  for (const name of CONFIG_FILES) {
    const path = resolve(cwd, name);
    if (await Bun.file(path).exists()) {
      return path;
    }
  }
  return null;
}

const cwd = process.cwd();
const configPath = await findConfig(cwd);

if (!configPath) {
  console.error(chalk.red(`No config file found. Create ${CONFIG_FILES[0]}`));
  process.exit(1);
}

// Clear registry before loading config
clearRegistry();

// Import config (side effects register rules via use())
const mod = await import(configPath);

// Check registry first, then fallback to default export
let rules = getRegisteredRules();

if (rules.length === 0 && mod.default) {
  const config = typeof mod.default === 'function' ? mod.default() : mod.default;
  if (Array.isArray(config)) {
    rules = normalizeRules(config);
  }
}

if (rules.length === 0) {
  console.error(chalk.red('No rules found. Use use() or export default.'));
  process.exit(1);
}

const result = await runArch({
  rules,
  cwd,
});
printResult(result);
process.exit(result.passed ? 0 : 1);
