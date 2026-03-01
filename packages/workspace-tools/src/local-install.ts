#!/usr/bin/env bun
/**
 * BRIKA Local Install
 *
 * Builds from source and installs the compiled binary locally.
 *
 * Usage:
 *   bun run local-install
 *   bun run local-install --skip-build
 *   bun run local-install --dir ~/.brika
 */

import { existsSync } from 'node:fs';
import { chmod, copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import pc from 'picocolors';

const ROOT = resolve(import.meta.dir, '../../..');
const BINARY_NAME = process.platform === 'win32' ? 'brika.exe' : 'brika';
const BINARY_SRC = join(ROOT, 'apps/hub/dist', BINARY_NAME);
const UI_SRC = join(ROOT, 'apps/ui/dist');

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    'skip-build': {
      type: 'boolean',
      default: false,
    },
    dir: {
      type: 'string',
    },
    help: {
      type: 'boolean',
      short: 'h',
      default: false,
    },
  },
  strict: false,
});

if (values.help) {
  console.log(`
  Usage: bun run local-install [options]

  Options:
    --skip-build   Use existing dist artifacts
    --dir <path>   Install directory (default: ~/.brika)
    -h, --help     Show this help
`);
  process.exit(0);
}

const BIN_DIR = join(
  typeof values.dir === 'string' ? values.dir : join(homedir(), '.brika'),
  'bin'
);

// ── Helpers ─────────────────────────────────────────────────────────────────

const log = (msg: string) => console.log(`  ${msg}`);

async function exec(args: string[], timeout = 5 * 60_000): Promise<void> {
  const proc = Bun.spawn(args, {
    cwd: ROOT,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const kill = setTimeout(() => proc.kill(), timeout);
  const code = await proc.exited;
  clearTimeout(kill);
  if (code !== 0) {
    log(`${pc.red('error:')} ${args.join(' ')} exited with ${code}`);
    process.exit(1);
  }
}

// ── Build ───────────────────────────────────────────────────────────────────

console.log(`\n  ${pc.bold(pc.cyan('BRIKA Local Install'))}\n`);

if (!values['skip-build']) {
  log('Building UI...');
  await exec(['bun', 'run', '--filter', '@brika/ui', 'build']);
  log('Compiling binary...');
  await exec(['bun', 'run', '--filter', '@brika/hub', 'build', '--compile']);
  console.log();
}

// ── Install ─────────────────────────────────────────────────────────────────

if (!existsSync(BINARY_SRC) || !existsSync(UI_SRC)) {
  log(`${pc.red('error:')} dist artifacts missing — run without --skip-build`);
  process.exit(1);
}

log(`Installing to ${BIN_DIR}...`);
await mkdir(BIN_DIR, {
  recursive: true,
});

await copyFile(BINARY_SRC, join(BIN_DIR, BINARY_NAME));
await chmod(join(BIN_DIR, BINARY_NAME), 0o755);

await rm(join(BIN_DIR, 'ui'), {
  recursive: true,
  force: true,
});
await cp(UI_SRC, join(BIN_DIR, 'ui'), {
  recursive: true,
});

// ── PATH setup ──────────────────────────────────────────────────────────────

const inPath = process.env.PATH?.split(':').includes(BIN_DIR);

function resolveRcFile(shell: string, isFish: boolean): string {
  if (shell === 'zsh') {
    return join(homedir(), '.zshrc');
  }
  if (shell === 'bash') {
    return existsSync(join(homedir(), '.bash_profile'))
      ? join(homedir(), '.bash_profile')
      : join(homedir(), '.bashrc');
  }
  if (isFish) {
    return join(homedir(), '.config/fish/config.fish');
  }
  return join(homedir(), '.profile');
}

if (!inPath) {
  const shell = basename(process.env.SHELL ?? 'sh');
  const isFish = shell === 'fish';

  const rcFile = resolveRcFile(shell, isFish);

  const alreadyInRc = existsSync(rcFile) && (await readFile(rcFile, 'utf8')).includes(BIN_DIR);

  if (!alreadyInRc) {
    const line = isFish ? `set -gx PATH ${BIN_DIR} $PATH` : `export PATH="${BIN_DIR}:$PATH"`;
    await writeFile(rcFile, `\n# Brika\n${line}\n`, {
      flag: 'a',
    });
    log(pc.dim(`Added to PATH in ${rcFile}`));
  }
}

// ── Verify ──────────────────────────────────────────────────────────────────

const proc = Bun.spawn([join(BIN_DIR, BINARY_NAME), '--version'], {
  stdout: 'pipe',
  stderr: 'pipe',
  env: {
    ...process.env,
    NO_COLOR: '1',
  },
});
const kill = setTimeout(() => proc.kill(), 10_000);
const output = await new Response(proc.stdout).text();
clearTimeout(kill);

const [version = ''] = output.trim().split('\n');

if ((await proc.exited) !== 0) {
  log(`${pc.red('error:')} verification failed`);
  process.exit(1);
}

console.log();
log(pc.green(`${version} installed successfully!`));
log(pc.dim(`${BIN_DIR}/${BINARY_NAME}`));

if (!inPath) {
  console.log();
  const exportCmd = `export PATH="${BIN_DIR}:$PATH"`;
  log(`Restart your shell or: ${pc.bold(exportCmd)}`);
}

console.log();
