/**
 * Tests for CLI completions install/uninstall (filesystem-dependent code).
 *
 * The existing completions.test.ts covers isShell, shellList, detectShell,
 * and all three generateCompletions shell generators. This file covers the
 * remaining uncovered lines: installCompletions, uninstallCompletions, and
 * the internal rcFile / scriptFile path helpers.
 *
 * Since homedir() is cached per-process and we cannot use mock.module()
 * (Bun bug #12823), we spawn sub-processes with HOME overridden to a
 * temp directory so the functions write to safe, disposable locations.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ── test-level state ─────────────────────────────────────────────────────────

let tmpHome: string;

beforeEach(async () => {
  tmpHome = join(
    tmpdir(),
    `brika-completions-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  await mkdir(tmpHome, {
    recursive: true,
  });
});

afterEach(async () => {
  await rm(tmpHome, {
    recursive: true,
    force: true,
  });
});

// ── subprocess helper ────────────────────────────────────────────────────────

/**
 * Run a TypeScript snippet in a Bun subprocess with HOME set to tmpHome.
 * The snippet has access to:
 *   - `installCompletions`, `uninstallCompletions` from the completions module
 *   - `HOME` — the temp home directory (via process.env.HOME)
 *
 * The snippet MUST print JSON to stdout via console.log(JSON.stringify(...)).
 * Returns the parsed JSON result.
 */
async function runInSubprocess<T = unknown>(code: string): Promise<T> {
  // Build an inline script that imports from the completions module.
  // We use an absolute path so the subprocess can resolve the import.
  const script = `
import { installCompletions, uninstallCompletions } from '${join(
    __dirname,
    '..',
    'cli',
    'completions.ts'
  )}';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const HOME = process.env.HOME;

async function main() {
  ${code}
}

main().then(r => console.log(JSON.stringify(r))).catch(e => {
  console.error(e);
  process.exit(1);
});
`;

  const proc = Bun.spawn(
    [
      'bun',
      'run',
      '--silent',
      '-',
    ],
    {
      stdin: new Blob([
        script,
      ]),
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        HOME: tmpHome,
      },
      cwd: join(__dirname, '..', '..'),
    }
  );

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`Subprocess failed (exit ${exitCode}):\n${stderr}\n${stdout}`);
  }

  return JSON.parse(stdout.trim()) as T;
}

// ── installCompletions ───────────────────────────────────────────────────────

describe('installCompletions', () => {
  describe('fish shell', () => {
    test('writes completion script to ~/.config/fish/completions/brika.fish', async () => {
      const result = await runInSubprocess<{
        file: string;
        alreadyInstalled: boolean;
      }>(`
        const commands = [
          { name: 'start', description: 'Start server', handler: () => {} },
          { name: 'help', description: 'Show help', handler: () => {} },
        ];
        const res = await installCompletions('fish', commands);
        return { file: res.file, alreadyInstalled: res.alreadyInstalled };
      `);

      expect(result.alreadyInstalled).toBe(false);
      expect(result.file).toBe(join(tmpHome, '.config', 'fish', 'completions', 'brika.fish'));

      // Verify the file was actually written
      const content = await readFile(result.file, 'utf8');
      expect(content).toContain('complete -c brika -f');
      expect(content).toContain('start');
    });

    test('returns alreadyInstalled false for fish (no rc check)', async () => {
      const result = await runInSubprocess<{
        alreadyInstalled: boolean;
      }>(`
        const commands = [
          { name: 'test', description: 'A test', handler: () => {} },
          { name: 'help', description: 'Help', handler: () => {} },
        ];
        // Install twice
        await installCompletions('fish', commands);
        const res = await installCompletions('fish', commands);
        return { alreadyInstalled: res.alreadyInstalled };
      `);

      // Fish never checks rc file, so alreadyInstalled is always false
      expect(result.alreadyInstalled).toBe(false);
    });
  });

  describe('zsh shell', () => {
    test('writes completion script and appends source line to .zshrc', async () => {
      const result = await runInSubprocess<{
        file: string;
        alreadyInstalled: boolean;
        rcContent: string;
      }>(`
        const commands = [
          { name: 'start', description: 'Start server', handler: () => {} },
          { name: 'help', description: 'Show help', handler: () => {} },
        ];
        const res = await installCompletions('zsh', commands);
        const rcContent = await readFile(join(HOME, '.zshrc'), 'utf8');
        return { file: res.file, alreadyInstalled: res.alreadyInstalled, rcContent };
      `);

      // Returns the rc file path (since it modified the rc)
      expect(result.file).toBe(join(tmpHome, '.zshrc'));
      expect(result.alreadyInstalled).toBe(false);

      // RC file should contain the source line
      expect(result.rcContent).toContain('# Brika completions');
      expect(result.rcContent).toContain('brika.zsh');
      expect(result.rcContent).toContain('source');

      // Completion script should also exist
      const scriptPath = join(tmpHome, '.brika', 'completions', 'brika.zsh');
      const scriptContent = await readFile(scriptPath, 'utf8');
      expect(scriptContent).toContain('_brika()');
      expect(scriptContent).toContain('compdef _brika brika');
    });

    test('returns alreadyInstalled true when rc already has the source line', async () => {
      const result = await runInSubprocess<{
        file: string;
        alreadyInstalled: boolean;
      }>(`
        const commands = [
          { name: 'start', description: 'Start server', handler: () => {} },
          { name: 'help', description: 'Show help', handler: () => {} },
        ];
        // Install once to create rc entry
        await installCompletions('zsh', commands);
        // Install again — should detect existing entry
        const res = await installCompletions('zsh', commands);
        return { file: res.file, alreadyInstalled: res.alreadyInstalled };
      `);

      // Second install should detect the marker in the rc file
      expect(result.alreadyInstalled).toBe(true);
      // Returns script file path (not rc) when already installed
      expect(result.file).toBe(join(tmpHome, '.brika', 'completions', 'brika.zsh'));
    });

    test('creates .zshrc if it does not exist', async () => {
      const result = await runInSubprocess<{
        rcExists: boolean;
      }>(`
        const commands = [
          { name: 'help', description: 'Help', handler: () => {} },
        ];
        await installCompletions('zsh', commands);
        return { rcExists: existsSync(join(HOME, '.zshrc')) };
      `);

      expect(result.rcExists).toBe(true);
    });
  });

  describe('bash shell', () => {
    test('writes completion script and appends source line to .bashrc (no .bash_profile)', async () => {
      const result = await runInSubprocess<{
        file: string;
        alreadyInstalled: boolean;
        rcContent: string;
      }>(`
        const commands = [
          { name: 'start', description: 'Start server', handler: () => {} },
          { name: 'help', description: 'Show help', handler: () => {} },
        ];
        const res = await installCompletions('bash', commands);
        const rcContent = await readFile(res.file, 'utf8');
        return { file: res.file, alreadyInstalled: res.alreadyInstalled, rcContent };
      `);

      // No .bash_profile in tmpHome, so it falls back to .bashrc
      expect(result.file).toBe(join(tmpHome, '.bashrc'));
      expect(result.alreadyInstalled).toBe(false);
      expect(result.rcContent).toContain('# Brika completions');
      expect(result.rcContent).toContain('brika.bash');
      expect(result.rcContent).toContain('source');

      // Verify the completion script was written
      const scriptPath = join(tmpHome, '.brika', 'completions', 'brika.bash');
      const scriptContent = await readFile(scriptPath, 'utf8');
      expect(scriptContent).toContain('_brika()');
      expect(scriptContent).toContain('complete -F _brika brika');
    });

    test('uses .bash_profile when it exists', async () => {
      // Pre-create .bash_profile
      await writeFile(join(tmpHome, '.bash_profile'), '# existing profile\n');

      const result = await runInSubprocess<{
        file: string;
      }>(`
        const commands = [
          { name: 'help', description: 'Help', handler: () => {} },
        ];
        const res = await installCompletions('bash', commands);
        return { file: res.file };
      `);

      expect(result.file).toBe(join(tmpHome, '.bash_profile'));
    });

    test('returns alreadyInstalled true on second install', async () => {
      const result = await runInSubprocess<{
        alreadyInstalled: boolean;
      }>(`
        const commands = [
          { name: 'start', description: 'Start server', handler: () => {} },
          { name: 'help', description: 'Show help', handler: () => {} },
        ];
        await installCompletions('bash', commands);
        const res = await installCompletions('bash', commands);
        return { alreadyInstalled: res.alreadyInstalled };
      `);

      expect(result.alreadyInstalled).toBe(true);
    });

    test('generates correct completion content for commands with options', async () => {
      const result = await runInSubprocess<{
        scriptContent: string;
      }>(`
        const commands = [
          {
            name: 'start',
            description: 'Start server',
            options: {
              port: { type: 'string', short: 'p', description: 'Port number' },
              verbose: { type: 'boolean', short: 'V', description: 'Verbose' },
            },
            handler: () => {},
          },
          { name: 'help', description: 'Help', handler: () => {} },
        ];
        await installCompletions('bash', commands);
        const scriptContent = await readFile(
          join(HOME, '.brika', 'completions', 'brika.bash'),
          'utf8'
        );
        return { scriptContent };
      `);

      expect(result.scriptContent).toContain('--port');
      expect(result.scriptContent).toContain('-p');
      expect(result.scriptContent).toContain('--verbose');
      expect(result.scriptContent).toContain('-V');
    });

    test('generates correct completion content for commands with subcommands', async () => {
      const result = await runInSubprocess<{
        scriptContent: string;
      }>(`
        const commands = [
          {
            name: 'plugin',
            description: 'Manage plugins',
            subcommands: [
              {
                name: 'install',
                description: 'Install a plugin',
                options: {
                  registry: { type: 'string', short: 'r', description: 'Registry URL' },
                },
                handler: () => {},
              },
              { name: 'list', description: 'List plugins', handler: () => {} },
              { name: 'help', description: 'Help', handler: () => {} },
            ],
            handler: () => {},
          },
          { name: 'help', description: 'Help', handler: () => {} },
        ];
        await installCompletions('bash', commands);
        const scriptContent = await readFile(
          join(HOME, '.brika', 'completions', 'brika.bash'),
          'utf8'
        );
        return { scriptContent };
      `);

      expect(result.scriptContent).toContain('plugin)');
      expect(result.scriptContent).toContain('install list help');
      expect(result.scriptContent).toContain('--registry');
      expect(result.scriptContent).toContain('-r');
    });
  });
});

// ── uninstallCompletions ─────────────────────────────────────────────────────

describe('uninstallCompletions', () => {
  test('returns empty array when no completion files exist', async () => {
    const result = await runInSubprocess<{
      cleaned: string[];
    }>(`
      const cleaned = await uninstallCompletions();
      return { cleaned };
    `);

    expect(result.cleaned).toEqual([]);
  });

  test('removes bash completion script and cleans rc file', async () => {
    const result = await runInSubprocess<{
      cleaned: string[];
      scriptExists: boolean;
      rcContent: string;
    }>(`
      // Install first
      const commands = [
        { name: 'start', description: 'Start server', handler: () => {} },
        { name: 'help', description: 'Help', handler: () => {} },
      ];
      await installCompletions('bash', commands);

      // Then uninstall
      const cleaned = await uninstallCompletions();
      const scriptPath = join(HOME, '.brika', 'completions', 'brika.bash');
      const scriptExists = existsSync(scriptPath);
      const rcContent = await readFile(join(HOME, '.bashrc'), 'utf8');
      return { cleaned, scriptExists, rcContent };
    `);

    expect(result.scriptExists).toBe(false);
    expect(result.cleaned.length).toBeGreaterThan(0);
    // RC file should have the brika lines removed
    expect(result.rcContent).not.toContain('.brika/completions/brika.');
  });

  test('removes zsh completion script and cleans rc file', async () => {
    const result = await runInSubprocess<{
      cleaned: string[];
      scriptExists: boolean;
      rcContent: string;
    }>(`
      const commands = [
        { name: 'start', description: 'Start server', handler: () => {} },
        { name: 'help', description: 'Help', handler: () => {} },
      ];
      await installCompletions('zsh', commands);

      const cleaned = await uninstallCompletions();
      const scriptPath = join(HOME, '.brika', 'completions', 'brika.zsh');
      const scriptExists = existsSync(scriptPath);
      const rcContent = await readFile(join(HOME, '.zshrc'), 'utf8');
      return { cleaned, scriptExists, rcContent };
    `);

    expect(result.scriptExists).toBe(false);
    expect(result.cleaned.length).toBeGreaterThan(0);
    expect(result.rcContent).not.toContain('.brika/completions/brika.');
    expect(result.rcContent).not.toContain('# Brika completions');
  });

  test('removes fish completion script', async () => {
    const result = await runInSubprocess<{
      cleaned: string[];
      scriptExists: boolean;
    }>(`
      const commands = [
        { name: 'start', description: 'Start server', handler: () => {} },
        { name: 'help', description: 'Help', handler: () => {} },
      ];
      await installCompletions('fish', commands);

      const cleaned = await uninstallCompletions();
      const scriptPath = join(HOME, '.config', 'fish', 'completions', 'brika.fish');
      const scriptExists = existsSync(scriptPath);
      return { cleaned, scriptExists };
    `);

    expect(result.scriptExists).toBe(false);
    expect(result.cleaned.length).toBeGreaterThan(0);
    expect(result.cleaned).toContainEqual(expect.stringContaining('brika.fish'));
  });

  test('removes all shells at once after installing all three', async () => {
    const result = await runInSubprocess<{
      cleaned: string[];
      bashExists: boolean;
      zshExists: boolean;
      fishExists: boolean;
    }>(`
      const commands = [
        { name: 'start', description: 'Start server', handler: () => {} },
        { name: 'help', description: 'Help', handler: () => {} },
      ];
      await installCompletions('bash', commands);
      await installCompletions('zsh', commands);
      await installCompletions('fish', commands);

      const cleaned = await uninstallCompletions();
      return {
        cleaned,
        bashExists: existsSync(join(HOME, '.brika', 'completions', 'brika.bash')),
        zshExists: existsSync(join(HOME, '.brika', 'completions', 'brika.zsh')),
        fishExists: existsSync(join(HOME, '.config', 'fish', 'completions', 'brika.fish')),
      };
    `);

    expect(result.bashExists).toBe(false);
    expect(result.zshExists).toBe(false);
    expect(result.fishExists).toBe(false);
    // At minimum: 3 script files + 2 rc files (bash, zsh)
    expect(result.cleaned.length).toBeGreaterThanOrEqual(5);
  });

  test('cleans rc files that contain the marker even without script files', async () => {
    // Pre-create an rc file with the marker but no script files
    const rcPath = join(tmpHome, '.zshrc');
    await writeFile(
      rcPath,
      '# existing\n# Brika completions\n[ -f ~/.brika/completions/brika.zsh ] && source ~/.brika/completions/brika.zsh\n# more stuff\n'
    );

    const result = await runInSubprocess<{
      cleaned: string[];
      rcContent: string;
    }>(`
      const cleaned = await uninstallCompletions();
      const rcContent = await readFile(join(HOME, '.zshrc'), 'utf8');
      return { cleaned, rcContent };
    `);

    expect(result.cleaned).toContainEqual(expect.stringContaining('.zshrc'));
    expect(result.rcContent).not.toContain('.brika/completions/brika.');
    expect(result.rcContent).not.toContain('# Brika completions');
    expect(result.rcContent).toContain('# existing');
    expect(result.rcContent).toContain('# more stuff');
  });

  test('handles rc file without the marker (no-op)', async () => {
    const rcPath = join(tmpHome, '.zshrc');
    const original = '# just some zsh config\nexport FOO=bar\n';
    await writeFile(rcPath, original);

    const result = await runInSubprocess<{
      cleaned: string[];
      rcContent: string;
    }>(`
      const cleaned = await uninstallCompletions();
      const rcContent = await readFile(join(HOME, '.zshrc'), 'utf8');
      return { cleaned, rcContent };
    `);

    // No script files existed and the rc had no marker, so nothing cleaned
    expect(result.cleaned).toEqual([]);
    expect(result.rcContent).toBe(original);
  });

  test('cleans .bash_profile when it contains the marker', async () => {
    const rcPath = join(tmpHome, '.bash_profile');
    await writeFile(
      rcPath,
      '# bash profile\n# Brika completions\n[ -f ~/.brika/completions/brika.bash ] && source ~/.brika/completions/brika.bash\n'
    );

    const result = await runInSubprocess<{
      cleaned: string[];
      rcContent: string;
    }>(`
      const cleaned = await uninstallCompletions();
      const rcContent = await readFile(join(HOME, '.bash_profile'), 'utf8');
      return { cleaned, rcContent };
    `);

    expect(result.cleaned).toContainEqual(expect.stringContaining('.bash_profile'));
    expect(result.rcContent).not.toContain('.brika/completions/brika.');
    expect(result.rcContent).toContain('# bash profile');
  });

  test('cleans fish config.fish when it contains the marker', async () => {
    const fishConfigDir = join(tmpHome, '.config', 'fish');
    await mkdir(fishConfigDir, {
      recursive: true,
    });
    const rcPath = join(fishConfigDir, 'config.fish');
    await writeFile(
      rcPath,
      '# fish config\n# Brika completions\n[ -f ~/.brika/completions/brika.fish ] && source ~/.brika/completions/brika.fish\n'
    );

    const result = await runInSubprocess<{
      cleaned: string[];
      rcContent: string;
    }>(`
      const rcPath = join(HOME, '.config', 'fish', 'config.fish');
      const cleaned = await uninstallCompletions();
      const rcContent = await readFile(rcPath, 'utf8');
      return { cleaned, rcContent };
    `);

    expect(result.cleaned).toContainEqual(expect.stringContaining('config.fish'));
    expect(result.rcContent).not.toContain('.brika/completions/brika.');
  });

  test('handles read errors on rc files gracefully', async () => {
    // Create a directory where a file is expected (causes read error)
    const rcDir = join(tmpHome, '.bashrc');
    await mkdir(rcDir, {
      recursive: true,
    });

    const result = await runInSubprocess<{
      cleaned: string[];
    }>(`
      const cleaned = await uninstallCompletions();
      return { cleaned };
    `);

    // Should not throw, just skip the problematic file
    expect(Array.isArray(result.cleaned)).toBe(true);
  });
});

// ── install + uninstall round-trip ───────────────────────────────────────────

describe('install + uninstall round-trip', () => {
  test('install then uninstall leaves no completion artifacts', async () => {
    const result = await runInSubprocess<{
      afterInstall: {
        bashScript: boolean;
        zshScript: boolean;
        fishScript: boolean;
      };
      afterUninstall: {
        bashScript: boolean;
        zshScript: boolean;
        fishScript: boolean;
      };
      cleanedCount: number;
    }>(`
      const commands = [
        { name: 'start', description: 'Start server', handler: () => {} },
        { name: 'help', description: 'Help', handler: () => {} },
      ];

      await installCompletions('bash', commands);
      await installCompletions('zsh', commands);
      await installCompletions('fish', commands);

      const afterInstall = {
        bashScript: existsSync(join(HOME, '.brika', 'completions', 'brika.bash')),
        zshScript: existsSync(join(HOME, '.brika', 'completions', 'brika.zsh')),
        fishScript: existsSync(join(HOME, '.config', 'fish', 'completions', 'brika.fish')),
      };

      const cleaned = await uninstallCompletions();

      const afterUninstall = {
        bashScript: existsSync(join(HOME, '.brika', 'completions', 'brika.bash')),
        zshScript: existsSync(join(HOME, '.brika', 'completions', 'brika.zsh')),
        fishScript: existsSync(join(HOME, '.config', 'fish', 'completions', 'brika.fish')),
      };

      return { afterInstall, afterUninstall, cleanedCount: cleaned.length };
    `);

    // After install, all scripts should exist
    expect(result.afterInstall.bashScript).toBe(true);
    expect(result.afterInstall.zshScript).toBe(true);
    expect(result.afterInstall.fishScript).toBe(true);

    // After uninstall, all scripts should be gone
    expect(result.afterUninstall.bashScript).toBe(false);
    expect(result.afterUninstall.zshScript).toBe(false);
    expect(result.afterUninstall.fishScript).toBe(false);

    // Should have cleaned multiple files
    expect(result.cleanedCount).toBeGreaterThanOrEqual(3);
  });

  test('uninstall is idempotent (second call returns empty)', async () => {
    const result = await runInSubprocess<{
      firstClean: string[];
      secondClean: string[];
    }>(`
      const commands = [
        { name: 'start', description: 'Start server', handler: () => {} },
        { name: 'help', description: 'Help', handler: () => {} },
      ];

      await installCompletions('zsh', commands);
      const firstClean = await uninstallCompletions();
      const secondClean = await uninstallCompletions();
      return { firstClean, secondClean };
    `);

    expect(result.firstClean.length).toBeGreaterThan(0);
    expect(result.secondClean).toEqual([]);
  });
});

// ── rcFile path logic (indirect) ─────────────────────────────────────────────

describe('rcFile path selection', () => {
  test('bash uses .bash_profile when it exists', async () => {
    // Pre-create .bash_profile in temp home
    await writeFile(join(tmpHome, '.bash_profile'), '# existing\n');

    const result = await runInSubprocess<{
      file: string;
    }>(`
      const commands = [
        { name: 'help', description: 'Help', handler: () => {} },
      ];
      const res = await installCompletions('bash', commands);
      return { file: res.file };
    `);

    expect(result.file).toBe(join(tmpHome, '.bash_profile'));
  });

  test('bash falls back to .bashrc when .bash_profile does not exist', async () => {
    // tmpHome has no .bash_profile by default
    const result = await runInSubprocess<{
      file: string;
    }>(`
      const commands = [
        { name: 'help', description: 'Help', handler: () => {} },
      ];
      const res = await installCompletions('bash', commands);
      return { file: res.file };
    `);

    expect(result.file).toBe(join(tmpHome, '.bashrc'));
  });

  test('zsh always uses .zshrc', async () => {
    const result = await runInSubprocess<{
      file: string;
    }>(`
      const commands = [
        { name: 'help', description: 'Help', handler: () => {} },
      ];
      const res = await installCompletions('zsh', commands);
      return { file: res.file };
    `);

    expect(result.file).toBe(join(tmpHome, '.zshrc'));
  });
});

// ── scriptFile path logic (indirect) ─────────────────────────────────────────

describe('scriptFile path selection', () => {
  test('bash script goes to ~/.brika/completions/brika.bash', async () => {
    const result = await runInSubprocess<{
      scriptExists: boolean;
    }>(`
      const commands = [
        { name: 'help', description: 'Help', handler: () => {} },
      ];
      await installCompletions('bash', commands);
      return {
        scriptExists: existsSync(join(HOME, '.brika', 'completions', 'brika.bash')),
      };
    `);

    expect(result.scriptExists).toBe(true);
  });

  test('zsh script goes to ~/.brika/completions/brika.zsh', async () => {
    const result = await runInSubprocess<{
      scriptExists: boolean;
    }>(`
      const commands = [
        { name: 'help', description: 'Help', handler: () => {} },
      ];
      await installCompletions('zsh', commands);
      return {
        scriptExists: existsSync(join(HOME, '.brika', 'completions', 'brika.zsh')),
      };
    `);

    expect(result.scriptExists).toBe(true);
  });

  test('fish script goes to ~/.config/fish/completions/brika.fish', async () => {
    const result = await runInSubprocess<{
      scriptExists: boolean;
    }>(`
      const commands = [
        { name: 'help', description: 'Help', handler: () => {} },
      ];
      await installCompletions('fish', commands);
      return {
        scriptExists: existsSync(join(HOME, '.config', 'fish', 'completions', 'brika.fish')),
      };
    `);

    expect(result.scriptExists).toBe(true);
  });
});

// ── uninstallCompletions: RC line filtering logic ────────────────────────────

describe('uninstallCompletions — RC line filtering', () => {
  test('removes the marker comment and the source line together', async () => {
    const rcPath = join(tmpHome, '.zshrc');
    await writeFile(
      rcPath,
      [
        'export FOO=bar',
        '# Brika completions',
        '[ -f ~/.brika/completions/brika.zsh ] && source ~/.brika/completions/brika.zsh',
        'export BAZ=qux',
      ].join('\n')
    );

    const result = await runInSubprocess<{
      rcContent: string;
    }>(`
      await uninstallCompletions();
      return { rcContent: await readFile(join(HOME, '.zshrc'), 'utf8') };
    `);

    expect(result.rcContent).toBe(
      [
        'export FOO=bar',
        'export BAZ=qux',
      ].join('\n')
    );
  });

  test('removes only the source line if marker is not on the previous line', async () => {
    const rcPath = join(tmpHome, '.bashrc');
    await writeFile(
      rcPath,
      [
        'export FOO=bar',
        '# some other comment',
        '[ -f ~/.brika/completions/brika.bash ] && source ~/.brika/completions/brika.bash',
        'export BAZ=qux',
      ].join('\n')
    );

    const result = await runInSubprocess<{
      rcContent: string;
    }>(`
      await uninstallCompletions();
      return { rcContent: await readFile(join(HOME, '.bashrc'), 'utf8') };
    `);

    expect(result.rcContent).toContain('# some other comment');
    expect(result.rcContent).not.toContain('.brika/completions/brika.');
  });

  test('handles multiple RC files in a single uninstall', async () => {
    // Set up both .zshrc and .bashrc with markers
    await writeFile(
      join(tmpHome, '.zshrc'),
      '# Brika completions\n[ -f ~/.brika/completions/brika.zsh ] && source ~/.brika/completions/brika.zsh\n'
    );
    await writeFile(
      join(tmpHome, '.bashrc'),
      '# Brika completions\n[ -f ~/.brika/completions/brika.bash ] && source ~/.brika/completions/brika.bash\n'
    );

    const result = await runInSubprocess<{
      cleaned: string[];
      zshContent: string;
      bashContent: string;
    }>(`
      const cleaned = await uninstallCompletions();
      const zshContent = await readFile(join(HOME, '.zshrc'), 'utf8');
      const bashContent = await readFile(join(HOME, '.bashrc'), 'utf8');
      return { cleaned, zshContent, bashContent };
    `);

    expect(result.cleaned).toContainEqual(expect.stringContaining('.zshrc'));
    expect(result.cleaned).toContainEqual(expect.stringContaining('.bashrc'));
    expect(result.zshContent).not.toContain('.brika/completions/brika.');
    expect(result.bashContent).not.toContain('.brika/completions/brika.');
  });

  test('preserves non-brika content in rc file when cleaning', async () => {
    const rcPath = join(tmpHome, '.zshrc');
    const original = [
      '# My zsh config',
      'export PATH="/usr/local/bin:$PATH"',
      '',
      '# Brika completions',
      '[ -f ~/.brika/completions/brika.zsh ] && source ~/.brika/completions/brika.zsh',
      '',
      '# NVM',
      'export NVM_DIR="$HOME/.nvm"',
    ].join('\n');
    await writeFile(rcPath, original);

    const result = await runInSubprocess<{
      rcContent: string;
    }>(`
      await uninstallCompletions();
      return { rcContent: await readFile(join(HOME, '.zshrc'), 'utf8') };
    `);

    expect(result.rcContent).toContain('# My zsh config');
    expect(result.rcContent).toContain('export PATH="/usr/local/bin:$PATH"');
    expect(result.rcContent).toContain('# NVM');
    expect(result.rcContent).toContain('export NVM_DIR="$HOME/.nvm"');
    expect(result.rcContent).not.toContain('# Brika completions');
    expect(result.rcContent).not.toContain('.brika/completions/brika.');
  });
});
