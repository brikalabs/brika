#!/usr/bin/env bun
/**
 * BRIKA Dead-Code Finder
 *
 * Scans the workspace for unused files, exports, types, and dependencies
 * using knip. The config is generated from the repo's conventions — no
 * hand-written file is required. Run with --eject to freeze the generated
 * config into deadcode.config.json for hand-tuning.
 *
 * Usage:
 *   bun run deadcode                          # full report
 *   bun run deadcode --filter @brika/hub      # one workspace
 *   bun run deadcode --production             # production code only
 *   bun run deadcode --fix                    # auto-remove safe findings
 *   bun run deadcode --json                   # machine-readable output
 *   bun run deadcode --eject                  # write deadcode.config.json
 */

import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import pc from 'picocolors';
import { buildKnipConfig } from './knip-config';
import { discoverPackages, filterPackages } from './workspace';

const ROOT = resolve(import.meta.dir, '../../..');
const CONFIG_FILE = 'deadcode.config.json';

const HELP = `
${pc.bold('workspace-tools')} — Dead-Code Finder

${pc.bold('Usage:')}
  ${pc.cyan('bun run deadcode')}                              ${pc.dim('Scan the entire workspace')}
  ${pc.cyan('bun run deadcode')} ${pc.cyan('--filter <pattern>')}           ${pc.dim('Restrict scan to matching workspaces')}
  ${pc.cyan('bun run deadcode')} ${pc.cyan('--production')}                 ${pc.dim('Skip dev/test entry points')}
  ${pc.cyan('bun run deadcode')} ${pc.cyan('--fix')}                        ${pc.dim('Auto-remove safe findings')}
  ${pc.cyan('bun run deadcode')} ${pc.cyan('--json')}                       ${pc.dim('Emit raw JSON (suitable for CI)')}
  ${pc.cyan('bun run deadcode')} ${pc.cyan('--eject')}                      ${pc.dim('Write the generated config to deadcode.config.json')}

${pc.bold('Flags:')}
  ${pc.cyan('-f, --filter <pattern>')}   Workspace name (glob, exact, or substring). Repeatable.
  ${pc.cyan('    --production')}         Limit analysis to production code paths
  ${pc.cyan('    --fix')}                Apply safe auto-fixes (removes unused exports/files)
  ${pc.cyan('    --json')}               Emit JSON to stdout
  ${pc.cyan('    --strict')}             Stricter analysis — treat all deps as production
  ${pc.cyan('    --eject')}              Write generated config to ./deadcode.config.json and exit
  ${pc.cyan('-h, --help')}               Show this help

${pc.bold('CI/CD exit-code control:')}
  ${pc.cyan('    --no-exit-code')}       Always exit 0 even when findings exist (report-only)
  ${pc.cyan('    --only <category>')}    Only check these categories (repeatable)
  ${pc.cyan('    --skip <category>')}    Skip these categories (repeatable)

  ${pc.dim('Categories: files, dependencies, devDependencies, unlisted, binaries,')}
  ${pc.dim('            exports, types, enumMembers, classMembers, duplicates')}

${pc.dim('Default: exits non-zero when findings are reported (suitable for CI gates).')}

${pc.bold('Examples:')}
  bun run deadcode --filter "@brika/*"
  bun run deadcode --filter @brika/hub --production
  bun run deadcode --json > deadcode.json
  bun run deadcode --only files --only dependencies         ${pc.dim('# gate on these only')}
  bun run deadcode --skip exports --skip types              ${pc.dim('# skip noisy API checks')}
  bun run deadcode --no-exit-code                           ${pc.dim('# report without gating')}
`;

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  strict: false,
  options: {
    help: { type: 'boolean', short: 'h', default: false },
    filter: { type: 'string', short: 'f', multiple: true },
    production: { type: 'boolean', default: false },
    fix: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
    strict: { type: 'boolean', default: false },
    eject: { type: 'boolean', default: false },
    'no-exit-code': { type: 'boolean', default: false },
    only: { type: 'string', multiple: true },
    skip: { type: 'string', multiple: true },
  },
});

if (values.help) {
  console.log(HELP);
  process.exit(0);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      out.push(item);
    }
  }
  return out;
}

const filters = toStringArray(values.filter);
const only = toStringArray(values.only);
const skip = toStringArray(values.skip);
const production = values.production === true;
const fix = values.fix === true;
const json = values.json === true;
const strict = values.strict === true;
const eject = values.eject === true;
const noExitCode = values['no-exit-code'] === true;

// ── Eject path: write config and exit ──────────────────────────────────────

if (eject) {
  const config = await buildKnipConfig(ROOT);
  const target = join(ROOT, CONFIG_FILE);
  await Bun.write(target, `${JSON.stringify(config, null, 2)}\n`);
  const count = Object.keys(config.workspaces ?? {}).length;
  console.log(`\n  ${pc.green('✓')} Wrote ${pc.cyan(CONFIG_FILE)} (${count} workspaces)\n`);
  process.exit(0);
}

// ── Resolve workspaces ──────────────────────────────────────────────────────

const knipArgs: string[] = ['knip', '--no-config-hints'];

if (filters.length > 0) {
  const allPackages = await discoverPackages(ROOT);
  const matched = filterPackages(allPackages, filters).filter(
    (pkg) => pkg.relativePath !== 'package.json'
  );

  if (matched.length === 0) {
    console.error(`${pc.red('\n  error ')}No workspaces matched the given --filter patterns.\n`);
    process.exit(1);
  }

  for (const pkg of matched) {
    knipArgs.push('--workspace', pkg.relativePath.replace(/\/package\.json$/, ''));
  }
}

if (production) {
  knipArgs.push('--production');
}
if (fix) {
  knipArgs.push('--fix');
}
if (json) {
  knipArgs.push('--reporter', 'json');
}
if (strict) {
  knipArgs.push('--strict');
}
if (noExitCode) {
  knipArgs.push('--no-exit-code');
}
for (const category of only) {
  knipArgs.push('--include', category);
}
for (const category of skip) {
  knipArgs.push('--exclude', category);
}

// ── Generate config unless a hand-written one exists ───────────────────────

const committedConfig = join(ROOT, CONFIG_FILE);
const hasCommittedConfig = await Bun.file(committedConfig).exists();
let generatedConfigPath: string | undefined;

if (hasCommittedConfig) {
  knipArgs.push('--config', committedConfig);
} else {
  const config = await buildKnipConfig(ROOT);
  generatedConfigPath = join(tmpdir(), `brika-deadcode-${process.pid}-${Date.now()}.json`);
  await Bun.write(generatedConfigPath, JSON.stringify(config));
  knipArgs.push('--config', generatedConfigPath);
}

// ── Header ──────────────────────────────────────────────────────────────────

if (!json) {
  console.log(`\n  ${pc.bold(pc.cyan('BRIKA Dead-Code Finder'))}\n`);
  const scope = filters.length > 0 ? filters.join(', ') : 'all workspaces';
  const mode = production ? ' (production)' : '';
  const action = fix ? ' [fix mode]' : '';
  const source = hasCommittedConfig
    ? ` · using committed ${CONFIG_FILE}`
    : ' · auto-generated config';
  console.log(pc.dim(`  Scanning ${scope}${mode}${action}${source}\n`));
}

// ── Run knip ────────────────────────────────────────────────────────────────

const proc = Bun.spawn(['bunx', '--bun', ...knipArgs], {
  cwd: ROOT,
  stdout: 'inherit',
  stderr: 'inherit',
  env: process.env,
});

const code = await proc.exited;

if (generatedConfigPath) {
  await rm(generatedConfigPath, { force: true });
}

if (!json) {
  console.log();
  if (noExitCode) {
    console.log(`  ${pc.dim('Report-only mode (--no-exit-code) — exit status forced to 0.')}\n`);
  } else if (code === 0) {
    console.log(`  ${pc.green('✓')} No dead code found.\n`);
  } else {
    console.log(`  ${pc.yellow('!')} Issues reported above.\n`);
  }
}

process.exit(code);
