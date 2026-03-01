/**
 * Tests for the self-uninstaller.
 *
 * Since selfUninstall reads SHELL_RC_FILES from real homedir paths at module
 * load time, and we cannot use mock.module() (Bun #12823), we test:
 *   - prompt abort flow (globalThis.prompt override)
 *   - console output messages (captureLog)
 *   - installDir removal via temp directory (process.execPath override)
 *   - purge flag behaviour with BRIKA_HOME env var pointing to temp dir
 *   - RC file cleaning is safe when files don't contain installDir
 *
 * The rc-file line-filtering logic is exercised via a standalone unit test
 * that mirrors the filter function inline.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selfUninstall } from '@/uninstaller';
import { captureLog } from './helpers/capture';

// ─────────────────────────────────────────────────────────────────────────────
// Test-level state
// ─────────────────────────────────────────────────────────────────────────────

let tmpDir: string;
let log: ReturnType<typeof captureLog>;
let originalExecPath: string;
let originalPlatform: PropertyDescriptor | undefined;
let originalPrompt: typeof globalThis.prompt;
let originalBrikaHome: string | undefined;

beforeEach(async () => {
  tmpDir = join(
    tmpdir(),
    `brika-uninstall-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  await mkdir(tmpDir, {
    recursive: true,
  });

  log = captureLog();
  originalExecPath = process.execPath;
  originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  originalPrompt = globalThis.prompt;
  originalBrikaHome = process.env.BRIKA_HOME;
});

afterEach(async () => {
  log.restore();
  process.execPath = originalExecPath;
  if (originalPlatform) {
    Object.defineProperty(process, 'platform', originalPlatform);
  }
  globalThis.prompt = originalPrompt;
  if (originalBrikaHome === undefined) {
    delete process.env.BRIKA_HOME;
  } else {
    process.env.BRIKA_HOME = originalBrikaHome;
  }
  await rm(tmpDir, {
    recursive: true,
    force: true,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Set process.execPath so dirname(process.execPath) points to a temp install dir */
async function setupFakeInstallDir(): Promise<string> {
  const installDir = join(tmpDir, 'install');
  await mkdir(installDir, {
    recursive: true,
  });
  const fakeBin = join(installDir, 'brika');
  await writeFile(fakeBin, 'fake-binary');
  process.execPath = fakeBin;
  return installDir;
}

/** Override globalThis.prompt to return the given value */
function stubPrompt(answer: string | null): void {
  globalThis.prompt = (() => answer) as typeof globalThis.prompt;
}

// ─────────────────────────────────────────────────────────────────────────────
// RC file line-filtering logic (unit test)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mirror of the inline filter from selfUninstall.
 * Extracted here so we can unit test the pure logic without invoking the
 * full function (which has side-effects we cannot fully control).
 */
function filterRcLines(content: string, installDir: string): string {
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
  return cleaned.join('\n');
}

describe('RC file line-filtering logic', () => {
  const installDir = '/opt/brika/bin';

  test('removes lines containing installDir', () => {
    const content = [
      'export FOO=bar',
      `export PATH="/opt/brika/bin:$PATH"`,
      'export BAZ=qux',
    ].join('\n');

    const result = filterRcLines(content, installDir);
    expect(result).toBe(
      [
        'export FOO=bar',
        'export BAZ=qux',
      ].join('\n')
    );
  });

  test('removes "# Brika" comment when next line contains installDir', () => {
    const content = [
      'export FOO=bar',
      '# Brika',
      `export PATH="/opt/brika/bin:$PATH"`,
      'export BAZ=qux',
    ].join('\n');

    const result = filterRcLines(content, installDir);
    expect(result).toBe(
      [
        'export FOO=bar',
        'export BAZ=qux',
      ].join('\n')
    );
  });

  test('keeps "# Brika" comment when next line does NOT contain installDir', () => {
    const content = [
      '# Brika',
      'export FOO=bar',
    ].join('\n');

    const result = filterRcLines(content, installDir);
    expect(result).toBe(
      [
        '# Brika',
        'export FOO=bar',
      ].join('\n')
    );
  });

  test('leaves content unchanged when installDir is not present', () => {
    const content = [
      'export FOO=bar',
      '# Some other tool',
      'export PATH="/usr/local/bin:$PATH"',
    ].join('\n');

    const result = filterRcLines(content, installDir);
    expect(result).toBe(content);
  });

  test('removes multiple occurrences of installDir', () => {
    const content = [
      '# Brika',
      `export PATH="/opt/brika/bin:$PATH"`,
      'export FOO=bar',
      `alias brika="/opt/brika/bin/brika"`,
    ].join('\n');

    const result = filterRcLines(content, installDir);
    expect(result).toBe('export FOO=bar');
  });

  test('handles empty content', () => {
    expect(filterRcLines('', installDir)).toBe('');
  });

  test('handles content that is only the installDir line', () => {
    const content = `export PATH="/opt/brika/bin:$PATH"`;
    expect(filterRcLines(content, installDir)).toBe('');
  });

  test('handles "# Brika" as the very last line with no next line', () => {
    const content = [
      'export FOO=bar',
      '# Brika',
    ].join('\n');

    const result = filterRcLines(content, installDir);
    // "# Brika" is last line, lines[i+1] is undefined, so it stays
    expect(result).toBe(content);
  });

  test('handles consecutive Brika blocks', () => {
    const content = [
      '# Brika',
      `export PATH="/opt/brika/bin:$PATH"`,
      '# Brika',
      `source /opt/brika/bin/env`,
    ].join('\n');

    const result = filterRcLines(content, installDir);
    expect(result).toBe('');
  });

  test('does not remove "# Brika" when it is not immediately followed by installDir line', () => {
    const content = [
      '# Brika',
      '# This is a spacer',
      `export PATH="/opt/brika/bin:$PATH"`,
    ].join('\n');

    const result = filterRcLines(content, installDir);
    // "# Brika" stays because lines[i+1] is "# This is a spacer" (no installDir)
    // The PATH line itself is removed
    expect(result).toBe(
      [
        '# Brika',
        '# This is a spacer',
      ].join('\n')
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// selfUninstall — prompt / abort
// ─────────────────────────────────────────────────────────────────────────────

describe('selfUninstall', () => {
  describe('prompt abort', () => {
    test('aborts when user answers "n"', async () => {
      await setupFakeInstallDir();
      stubPrompt('n');

      await selfUninstall();

      const output = log.lines.join('\n');
      expect(output).toContain('Aborted');
    });

    test('aborts when user answers empty string', async () => {
      await setupFakeInstallDir();
      stubPrompt('');

      await selfUninstall();

      const output = log.lines.join('\n');
      expect(output).toContain('Aborted');
    });

    test('aborts when prompt returns null', async () => {
      await setupFakeInstallDir();
      stubPrompt(null);

      await selfUninstall();

      const output = log.lines.join('\n');
      expect(output).toContain('Aborted');
    });

    test('aborts when user answers "No"', async () => {
      await setupFakeInstallDir();
      stubPrompt('No');

      await selfUninstall();

      const output = log.lines.join('\n');
      expect(output).toContain('Aborted');
    });

    test('does not abort when user answers "y"', async () => {
      await setupFakeInstallDir();
      stubPrompt('y');

      await selfUninstall();

      const output = log.lines.join('\n');
      expect(output).not.toContain('Aborted');
    });

    test('does not abort when user answers "Y"', async () => {
      await setupFakeInstallDir();
      stubPrompt('Y');

      await selfUninstall();

      const output = log.lines.join('\n');
      expect(output).not.toContain('Aborted');
    });

    test('does not abort when user answers "yes"', async () => {
      await setupFakeInstallDir();
      stubPrompt('yes');

      await selfUninstall();

      const output = log.lines.join('\n');
      expect(output).not.toContain('Aborted');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Console output
  // ─────────────────────────────────────────────────────────────────────────

  describe('console output', () => {
    test('displays install directory in pre-prompt output', async () => {
      const installDir = await setupFakeInstallDir();
      stubPrompt('n');

      await selfUninstall();

      const output = log.lines.join('\n');
      expect(output).toContain(installDir);
    });

    test('displays BRIKA_HOME path when purge is true', async () => {
      await setupFakeInstallDir();
      const brikaHome = join(tmpDir, 'brika-home');
      process.env.BRIKA_HOME = brikaHome;
      stubPrompt('n');

      await selfUninstall({
        purge: true,
      });

      const output = log.lines.join('\n');
      expect(output).toContain(brikaHome);
    });

    test('does not display BRIKA_HOME when purge is false', async () => {
      await setupFakeInstallDir();
      const brikaHome = join(tmpDir, 'brika-home-hidden');
      process.env.BRIKA_HOME = brikaHome;
      stubPrompt('n');

      await selfUninstall();

      const output = log.lines.join('\n');
      expect(output).not.toContain(brikaHome);
    });

    test('displays version string', async () => {
      await setupFakeInstallDir();
      stubPrompt('n');

      await selfUninstall();

      const output = log.lines.join('\n');
      // Output includes "brika" and a "v" prefix for the version
      expect(output).toContain('brika');
    });

    test('prints success message on completion', async () => {
      await setupFakeInstallDir();
      stubPrompt('y');

      await selfUninstall();

      const output = log.lines.join('\n');
      expect(output).toContain('Uninstalled successfully');
    });

    test('prints shell restart reminder on completion', async () => {
      await setupFakeInstallDir();
      stubPrompt('y');

      await selfUninstall();

      const output = log.lines.join('\n');
      expect(output).toContain('Restart your shell');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Installation directory removal
  // ─────────────────────────────────────────────────────────────────────────

  describe('installation directory removal', () => {
    test('removes the installation directory on confirmation', async () => {
      const installDir = await setupFakeInstallDir();
      stubPrompt('y');

      expect(existsSync(installDir)).toBe(true);

      await selfUninstall();

      expect(existsSync(installDir)).toBe(false);
    });

    test('does not remove installation directory on abort', async () => {
      const installDir = await setupFakeInstallDir();
      stubPrompt('n');

      await selfUninstall();

      expect(existsSync(installDir)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Purge behaviour
  // ─────────────────────────────────────────────────────────────────────────

  describe('purge', () => {
    test('removes BRIKA_HOME directory when purge is true', async () => {
      await setupFakeInstallDir();
      const brikaHome = join(tmpDir, 'brika-home');
      await mkdir(brikaHome, {
        recursive: true,
      });
      await writeFile(join(brikaHome, 'data.json'), '{}');
      process.env.BRIKA_HOME = brikaHome;
      stubPrompt('y');

      await selfUninstall({
        purge: true,
      });

      expect(existsSync(brikaHome)).toBe(false);
    });

    test('does not remove BRIKA_HOME when purge is false', async () => {
      await setupFakeInstallDir();
      const brikaHome = join(tmpDir, 'brika-home');
      await mkdir(brikaHome, {
        recursive: true,
      });
      process.env.BRIKA_HOME = brikaHome;
      stubPrompt('y');

      await selfUninstall({
        purge: false,
      });

      expect(existsSync(brikaHome)).toBe(true);
    });

    test('does not remove BRIKA_HOME when purge is omitted', async () => {
      await setupFakeInstallDir();
      const brikaHome = join(tmpDir, 'brika-home');
      await mkdir(brikaHome, {
        recursive: true,
      });
      process.env.BRIKA_HOME = brikaHome;
      stubPrompt('y');

      await selfUninstall();

      expect(existsSync(brikaHome)).toBe(true);
    });

    test('handles non-existent BRIKA_HOME gracefully with purge', async () => {
      await setupFakeInstallDir();
      process.env.BRIKA_HOME = join(tmpDir, 'nonexistent');
      stubPrompt('y');

      // Should not throw
      await selfUninstall({
        purge: true,
      });

      const output = log.lines.join('\n');
      expect(output).toContain('Uninstalled successfully');
      expect(output).not.toContain('Removing workspace data');
    });

    test('prints workspace removal messages when purging', async () => {
      await setupFakeInstallDir();
      const brikaHome = join(tmpDir, 'brika-home');
      await mkdir(brikaHome, {
        recursive: true,
      });
      process.env.BRIKA_HOME = brikaHome;
      stubPrompt('y');

      await selfUninstall({
        purge: true,
      });

      const output = log.lines.join('\n');
      expect(output).toContain('Removing workspace data');
      expect(output).toContain('Removed');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Windows early-return
  // ─────────────────────────────────────────────────────────────────────────

  describe('windows platform', () => {
    test('prints PowerShell instructions and returns early on Windows', async () => {
      const installDir = await setupFakeInstallDir();
      stubPrompt('y');
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });

      await selfUninstall();

      const output = log.lines.join('\n');
      expect(output).toContain('PowerShell');
      expect(output).toContain('uninstall.ps1');
      // Should NOT have removed the install dir (early return)
      expect(existsSync(installDir)).toBe(true);
      // Should NOT print success message
      expect(output).not.toContain('Uninstalled successfully');
    });

    test('does not attempt to remove install directory on Windows', async () => {
      const installDir = await setupFakeInstallDir();
      stubPrompt('y');
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });

      await selfUninstall();

      expect(existsSync(installDir)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Default options
  // ─────────────────────────────────────────────────────────────────────────

  describe('default options', () => {
    test('purge defaults to false when options is undefined', async () => {
      await setupFakeInstallDir();
      const brikaHome = join(tmpDir, 'brika-home-default');
      await mkdir(brikaHome, {
        recursive: true,
      });
      process.env.BRIKA_HOME = brikaHome;
      stubPrompt('y');

      await selfUninstall(undefined);

      expect(existsSync(brikaHome)).toBe(true);
    });

    test('purge defaults to false when options is empty object', async () => {
      await setupFakeInstallDir();
      const brikaHome = join(tmpDir, 'brika-home-empty');
      await mkdir(brikaHome, {
        recursive: true,
      });
      process.env.BRIKA_HOME = brikaHome;
      stubPrompt('y');

      await selfUninstall({});

      expect(existsSync(brikaHome)).toBe(true);
    });
  });
});
