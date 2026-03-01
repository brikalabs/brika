/**
 * BRIKA Self-Uninstaller
 *
 * Removes the Brika installation directory and cleans up shell PATH entries.
 * Triggered by `brika uninstall`.
 */

import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import pc from 'picocolors';
import { uninstallCompletions } from '@/cli/completions';
import { HUB_REPO_URL, hub } from '@/hub';

/** Shell rc files that may contain a PATH entry added by the installer */
const SHELL_RC_FILES = [
  `${homedir()}/.zshrc`,
  `${homedir()}/.bashrc`,
  `${homedir()}/.bash_profile`,
  `${homedir()}/.profile`,
  `${homedir()}/.config/fish/config.fish`,
];

export async function selfUninstall(options?: { purge?: boolean }): Promise<void> {
  const installDir = dirname(process.execPath);
  const isWindows = process.platform === 'win32';
  const purge = options?.purge ?? false;
  const brikaHome = resolve(process.env.BRIKA_HOME ?? '.brika');

  const versionLabel = pc.dim(`v${hub.version}`);
  console.log(`${pc.cyan('brika')} ${versionLabel}`);
  console.log();
  console.log(`  ${pc.bold('This will remove:')} ${installDir}`);
  if (purge) {
    console.log(`  ${pc.bold('This will also remove:')} ${brikaHome}`);
  }
  console.log();

  const answer = prompt(`  Continue? ${pc.dim('[y/N]')} `) ?? '';
  if (!/^[yY]/.test(answer)) {
    console.log(`  ${pc.dim('Aborted.')}`);
    return;
  }

  console.log();

  // On Windows the running .exe is locked — can't delete ourselves
  if (isWindows) {
    console.log(`  ${pc.yellow('Note:')} The binary cannot be deleted while running on Windows.`);
    console.log('  Please use the PowerShell uninstaller instead:');
    console.log();
    const psCommand = pc.cyan(`irm ${HUB_REPO_URL}/raw/main/scripts/uninstall.ps1 | iex`);
    console.log(`    ${psCommand}`);
    console.log();
    return;
  }

  // Remove the installation directory (safe on Unix — running process keeps its fd)
  console.log(`  ${pc.dim('Removing installation...')}`);
  await rm(installDir, {
    recursive: true,
    force: true,
  });

  // Remove completions (scripts + rc entries) — delegated to the completions module
  await uninstallCompletions();

  // Clean up PATH entries the installer added to shell rc files
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
        if (line.includes(installDir)) {
          return false;
        }
        if (line === '# Brika' && lines[i + 1]?.includes(installDir)) {
          return false;
        }
        return true;
      });

      await writeFile(rcFile, cleaned.join('\n'), 'utf8');
      const cleanedLabel = pc.dim(`Cleaned ${rcFile}`);
      console.log(`  ${cleanedLabel}`);
    } catch {
      // Non-critical — leftover lines are harmless
    }
  }

  if (purge && existsSync(brikaHome)) {
    console.log(`  ${pc.dim('Removing workspace data...')}`);
    await rm(brikaHome, {
      recursive: true,
      force: true,
    });
    const removedLabel = pc.dim(`Removed ${brikaHome}`);
    console.log(`  ${removedLabel}`);
  }

  console.log();
  console.log(`  ${pc.green('Uninstalled successfully!')}`);
  console.log();
  console.log(`  ${pc.dim('Restart your shell to apply PATH changes.')}`);
  console.log();
}
