/// <reference path="./embedded-cli-module.d.ts" />
/**
 * Compiled-mode delegation for the author toolchain.
 *
 * A compiled binary cannot run `brika build` in-process: manifest generation
 * imports the plugin's source modules, and Bun's standalone runtime loader
 * does not resolve bare specifiers (`@brika/sdk`) from disk files loaded at
 * runtime. The production build therefore embeds the self-contained author
 * CLI as the virtual module `brika:embedded-cli` (see
 * `apps/build/src/plugins/embed-cli.ts`); this module materializes it to
 * `<dataDir>/runtime/brika-cli-<hash>.js` and re-runs the build in a plain-bun
 * child (`BUN_BE_BUN=1` on the running binary), where plugin imports resolve
 * normally from the plugin's node_modules.
 */

import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isCompiledFrom, resolveDataDir, resolveSystemDir } from '../src/exec-context';

/** True when the running toolchain must delegate (compiled binary). */
export function shouldDelegateToEmbeddedCli(): boolean {
  return isCompiledFrom(import.meta.path);
}

/**
 * Write the embedded CLI source to `<dataDir>/runtime/brika-cli-<hash>.js`
 * (content-addressed, written once).
 */
export async function materializeEmbeddedCli(source: string, dataDir: string): Promise<string> {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(source);
  const hash = hasher.digest('hex').slice(0, 16);
  const dir = join(dataDir, 'runtime');
  const path = join(dir, `brika-cli-${hash}.js`);
  if (!(await Bun.file(path).exists())) {
    await mkdir(dir, { recursive: true });
    await Bun.write(path, source);
  }
  return path;
}

/**
 * Run the materialized CLI in a plain-bun child (the running binary with
 * `BUN_BE_BUN=1`), inheriting stdio so output is indistinguishable from the
 * in-process path. Returns the child's exit code.
 */
export function runMaterializedCli(
  cliPath: string,
  args: ReadonlyArray<string>,
  cwd: string
): Promise<number> {
  const proc = Bun.spawn([process.execPath, cliPath, ...args], {
    cwd,
    env: { ...process.env, BUN_BE_BUN: '1' },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  return proc.exited;
}

/** Default loader for the build-time virtual module; injectable for tests. */
async function loadEmbeddedCliSource(): Promise<string> {
  const { default: source } = await import('brika:embedded-cli');
  return source;
}

/** `runBuild`, delegated: re-run `brika build` through the embedded CLI. */
export async function runEmbeddedBuild(
  root: string,
  check: boolean,
  loadSource: () => Promise<string> = loadEmbeddedCliSource
): Promise<boolean> {
  const source = await loadSource();
  const dataDir = resolveDataDir({
    env: process.env,
    isCompiled: true,
    execPath: process.execPath,
    cwd: process.cwd(),
    home: homedir(),
    platform: process.platform,
  }).path;
  const cliPath = await materializeEmbeddedCli(source, resolveSystemDir(dataDir));
  const args = ['build', '--dir', root, ...(check ? ['--check'] : [])];
  return (await runMaterializedCli(cliPath, args, root)) === 0;
}
