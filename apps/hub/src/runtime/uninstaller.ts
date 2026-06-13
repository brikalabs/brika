/**
 * BRIKA Self-Uninstaller
 *
 * Removes the Brika installation directory and cleans up shell PATH entries.
 * Triggered by `brika uninstall`.
 */

import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import { isCompiledFrom, resolveDataDir } from '@brika/sdk/exec-context';
import pc from 'picocolors';
import { HUB_REPO_URL, hub } from '../hub';
import { brikaContext } from './context/brika-context';
import { purgeServiceSecrets } from './secrets/purge';

/** Shell rc files that may contain a PATH entry added by the installer */
const SHELL_RC_FILES = [
  `${homedir()}/.zshrc`,
  `${homedir()}/.bashrc`,
  `${homedir()}/.bash_profile`,
  `${homedir()}/.profile`,
  `${homedir()}/.config/fish/config.fish`,
];

interface UninstallPlan {
  readonly installDir: string;
  readonly brikaHome: string;
  readonly purge: boolean;
  readonly isWindows: boolean;
}

/** Print what the run will remove, before the confirmation prompt. */
function printPlan({ installDir, brikaHome, purge, isWindows }: UninstallPlan): void {
  console.log(`${pc.cyan('brika')} ${pc.dim(`v${hub.version}`)}`);
  console.log();
  if (isWindows) {
    // The running .exe holds a lock and can't delete itself; the PowerShell
    // uninstaller removes the binary. We still clean everything else below.
    console.log(`  ${pc.bold('This will remove:')} PATH entries and completions`);
  } else {
    console.log(`  ${pc.bold('This will remove:')} ${installDir}`);
  }
  if (purge) {
    console.log(`  ${pc.bold('This will also remove:')} ${brikaHome}`);
    console.log(`  ${pc.bold('and:')} stored secrets in the OS keychain`);
  } else {
    console.log(`  ${pc.dim(`Your data is kept at ${brikaHome} (use --purge to remove it).`)}`);
  }
  console.log();
}

/** Point the user at the PowerShell uninstaller for the locked binary. */
function printWindowsBinaryNote(): void {
  console.log(`  ${pc.yellow('Note:')} The binary cannot be deleted while running on Windows.`);
  console.log('  Run the PowerShell uninstaller to remove it:');
  console.log();
  console.log(`    ${pc.cyan(`irm ${HUB_REPO_URL}/raw/main/scripts/uninstall.ps1 | iex`)}`);
  console.log();
}

/**
 * Remove completion scripts + rc entries via the `brika` bin (apps/console owns
 * the install/uninstall side-effects). Non-critical: older installs may not
 * ship the subcommand, and leftover completion scripts are harmless.
 */
async function removeCompletions(): Promise<void> {
  try {
    const proc = Bun.spawn(['brika', 'completions', '--uninstall'], {
      stdout: 'ignore',
      stderr: 'ignore',
    });
    await proc.exited;
  } catch {
    // Non-critical.
  }
}

/** Strip the installer's PATH lines (and their `# Brika` marker) from rc files. */
async function cleanShellPathEntries(installDir: string): Promise<void> {
  for (const rcFile of SHELL_RC_FILES) {
    if (!existsSync(rcFile)) {
      continue;
    }
    try {
      const content = await readFile(rcFile, 'utf8');
      if (!content.includes(installDir)) {
        continue;
      }
      const lines = content.split('\n');
      const cleaned = lines.filter((line, i) => {
        const isPathLine = line.includes(installDir);
        const isMarker = line === '# Brika' && lines[i + 1]?.includes(installDir);
        return !(isPathLine || isMarker);
      });
      await writeFile(rcFile, cleaned.join('\n'), 'utf8');
      console.log(`  ${pc.dim(`Cleaned ${rcFile}`)}`);
    } catch {
      // Non-critical: leftover lines are harmless.
    }
  }
}

/**
 * Wipe the OS keychain bucket then the data dir. The keychain goes first, while
 * the service name is still known: file-backend secrets live under `brikaHome`
 * and go with the rm, but keychain entries are external to it and would
 * otherwise be orphaned (and unrecoverable once instance.id is gone).
 */
async function purgeWorkspace(brikaHome: string, isWindows: boolean): Promise<void> {
  try {
    const removed = await purgeServiceSecrets(brikaContext.serviceName);
    if (removed > 0) {
      console.log(
        `  ${pc.dim(`Removed ${removed} keychain ${removed === 1 ? 'entry' : 'entries'}`)}`
      );
    }
  } catch {
    // Non-critical: a host with no keychain has nothing to remove.
  }

  if (isWindows) {
    // The running .exe lives inside brikaHome and is locked, so we can't remove
    // the data dir here; the PowerShell uninstaller does it once this process
    // has exited.
    console.log(`  ${pc.dim(`Data dir ${brikaHome} is removed by the uninstaller script.`)}`);
    return;
  }
  if (existsSync(brikaHome)) {
    console.log(`  ${pc.dim('Removing workspace data...')}`);
    await rm(brikaHome, { recursive: true, force: true });
    console.log(`  ${pc.dim(`Removed ${brikaHome}`)}`);
  }
}

export async function selfUninstall(options?: { purge?: boolean; yes?: boolean }): Promise<void> {
  const installDir = dirname(process.execPath);
  const isWindows = process.platform === 'win32';
  const purge = options?.purge ?? false;
  const yes = options?.yes ?? false;
  // Resolve via the SHARED resolver (same logic the hub used to create the dir),
  // not a raw cwd-relative `.brika`: --purge `rm -rf`s this path, so a divergent
  // guess could delete the wrong directory or miss the real one.
  const brikaHome = resolveDataDir({
    env: process.env,
    isCompiled: isCompiledFrom(import.meta.path),
    execPath: process.execPath,
    cwd: process.cwd(),
    home: homedir(),
    platform: process.platform,
  }).path;

  printPlan({ installDir, brikaHome, purge, isWindows });

  if (!yes) {
    const answer = prompt(`  Continue? ${pc.dim('[y/N]')} `) ?? '';
    if (!/^[yY]/.test(answer)) {
      console.log(`  ${pc.dim('Aborted.')}`);
      return;
    }
  }

  console.log();

  if (isWindows) {
    printWindowsBinaryNote();
  } else {
    // Removing the install dir is safe on Unix (the running process keeps its fd).
    console.log(`  ${pc.dim('Removing installation...')}`);
    await rm(installDir, { recursive: true, force: true });
  }

  await removeCompletions();
  await cleanShellPathEntries(installDir);
  if (purge) {
    await purgeWorkspace(brikaHome, isWindows);
  }

  console.log();
  if (isWindows) {
    // The binary + registry PATH are still in place; the PowerShell uninstaller
    // (noted above) finishes the job, so don't claim full completion here.
    console.log(`  ${pc.green('Cleanup staged.')}`);
    console.log();
    console.log(
      `  ${pc.dim('Run the PowerShell uninstaller to remove the binary and PATH entry.')}`
    );
  } else {
    console.log(`  ${pc.green('Uninstalled successfully!')}`);
    console.log();
    console.log(`  ${pc.dim('Restart your shell to apply PATH changes.')}`);
  }
  console.log();
}
