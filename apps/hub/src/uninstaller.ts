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
import pc from 'picocolors';
import { HUB_REPO_URL, hub } from '@/hub';

/** Shell rc files that may contain a PATH entry added by the installer */
const SHELL_RC_FILES = [
  `${homedir()}/.zshrc`,
  `${homedir()}/.bashrc`,
  `${homedir()}/.bash_profile`,
  `${homedir()}/.profile`,
  `${homedir()}/.config/fish/config.fish`,
];

export async function selfUninstall(): Promise<void> {
  const installDir = dirname(process.execPath);
  const isWindows = process.platform === 'win32';

  console.log(`${pc.cyan('brika')} ${pc.dim('v' + hub.version)}`);
  console.log();
  console.log(`  ${pc.bold('This will remove:')} ${installDir}`);
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
    console.log(
      `    ${pc.cyan('irm ' + HUB_REPO_URL + '/raw/master/scripts/uninstall.ps1 | iex')}`
    );
    console.log();
    return;
  }

  // Remove the installation directory (safe on Unix — running process keeps its fd)
  console.log(`  ${pc.dim('Removing installation...')}`);
  await rm(installDir, { recursive: true, force: true });

  // Clean up the PATH block the installer added to shell rc files.
  // The installer writes exactly two lines: "# Brika" followed by the export/set line.
  // We remove both by matching on the install directory path.
  for (const rcFile of SHELL_RC_FILES) {
    if (!existsSync(rcFile)) continue;
    try {
      const content = await readFile(rcFile, 'utf8');
      if (!content.includes(installDir)) continue;

      const lines = content.split('\n');
      const cleaned = lines.filter((line, i) => {
        // Remove the export/set line that references our install directory
        if (line.includes(installDir)) return false;
        // Remove the "# Brika" comment only when it directly precedes that line
        if (line === '# Brika' && lines[i + 1]?.includes(installDir)) return false;
        return true;
      });

      await writeFile(rcFile, cleaned.join('\n'), 'utf8');
      console.log(`  ${pc.dim('Cleaned ' + rcFile)}`);
    } catch {
      // Non-critical — a harmless PATH entry pointing to a non-existent dir is OK
    }
  }

  console.log();
  console.log(`  ${pc.green('Uninstalled successfully!')}`);
  console.log();
  console.log(`  ${pc.dim('Restart your shell to apply PATH changes.')}`);
  console.log();
}
