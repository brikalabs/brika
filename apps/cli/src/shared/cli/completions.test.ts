/**
 * Exercises the shell completion install / generate / uninstall
 * pipeline. `os.homedir` is spied so writes are scoped to a tmpdir and
 * the test never touches the user's real `~/.zshrc` / fish config.
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineCommand } from '@brika/cli';
import {
  detectShell,
  generateCompletions,
  installCompletions,
  isShell,
  shellList,
  uninstallCompletions,
} from './completions';

const cmds = [
  defineCommand({
    name: 'hub',
    description: 'Hub commands',
    options: {
      verbose: { type: 'boolean', short: 'v', description: 'increase log verbosity' },
      port: { type: 'string', short: 'p', description: 'listen port' },
    },
    handler: () => {},
  }),
  defineCommand({
    name: 'plugins',
    description: 'Plugin tooling',
    handler: () => {},
  }),
];

describe('isShell', () => {
  test('accepts known shells', () => {
    expect(isShell('bash')).toBe(true);
    expect(isShell('zsh')).toBe(true);
    expect(isShell('fish')).toBe(true);
  });

  test('rejects unknown shells', () => {
    expect(isShell('pwsh')).toBe(false);
    expect(isShell('')).toBe(false);
  });
});

describe('shellList', () => {
  test('returns comma-joined supported shells', () => {
    expect(shellList()).toBe('bash, zsh, fish');
  });
});

describe('detectShell', () => {
  let originalShell: string | undefined;

  beforeEach(() => {
    originalShell = process.env.SHELL;
  });

  afterEach(() => {
    if (originalShell === undefined) {
      delete process.env.SHELL;
    } else {
      process.env.SHELL = originalShell;
    }
  });

  test('returns the shell name from $SHELL when known', () => {
    process.env.SHELL = '/usr/local/bin/zsh';
    expect(detectShell()).toBe('zsh');
  });

  test('returns null for unsupported shells', () => {
    process.env.SHELL = '/bin/pwsh';
    expect(detectShell()).toBeNull();
  });

  test('returns null when $SHELL is unset', () => {
    delete process.env.SHELL;
    expect(detectShell()).toBeNull();
  });
});

describe('generateCompletions', () => {
  test('produces a non-empty bash script with the brika handler', () => {
    const out = generateCompletions(cmds, 'bash');
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('_brika()');
    expect(out).toContain('complete -F _brika brika');
  });

  test('produces a non-empty zsh script with compdef', () => {
    const out = generateCompletions(cmds, 'zsh');
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('_brika()');
    expect(out).toContain('compdef _brika brika');
  });

  test('produces a non-empty fish script with subcommand registration', () => {
    const out = generateCompletions(cmds, 'fish');
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('complete -c brika');
    expect(out).toContain("__fish_use_subcommand' -a hub");
  });
});

describe('install / uninstall completions', () => {
  let fakeHome: string;
  let homedirSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    fakeHome = mkdtempSync(join(tmpdir(), 'brika-completions-'));
    homedirSpy = spyOn(os, 'homedir').mockReturnValue(fakeHome);
  });

  afterEach(() => {
    homedirSpy.mockRestore();
    rmSync(fakeHome, { recursive: true, force: true });
  });

  test('installs the zsh script + appends a source line to .zshrc', async () => {
    writeFileSync(join(fakeHome, '.zshrc'), '# existing\n', 'utf8');
    const result = await installCompletions('zsh', cmds);
    expect(result.alreadyInstalled).toBe(false);
    expect(result.file).toBe(join(fakeHome, '.zshrc'));

    const script = readFileSync(join(fakeHome, '.brika', 'completions', 'brika.zsh'), 'utf8');
    expect(script).toContain('_brika()');

    const rc = readFileSync(join(fakeHome, '.zshrc'), 'utf8');
    expect(rc).toContain('# Brika completions');
    expect(rc).toContain('.brika/completions/brika.zsh');
  });

  test('install is idempotent — second call reports alreadyInstalled', async () => {
    writeFileSync(join(fakeHome, '.zshrc'), '# existing\n', 'utf8');
    await installCompletions('zsh', cmds);
    const second = await installCompletions('zsh', cmds);
    expect(second.alreadyInstalled).toBe(true);
    expect(second.file).toBe(join(fakeHome, '.brika', 'completions', 'brika.zsh'));
  });

  test('fish install drops the script under fish completions without rc edits', async () => {
    const result = await installCompletions('fish', cmds);
    expect(result.alreadyInstalled).toBe(false);
    expect(result.file).toBe(join(fakeHome, '.config', 'fish', 'completions', 'brika.fish'));
    expect(existsSync(result.file)).toBe(true);
  });

  test('bash falls back to .bashrc when no .bash_profile exists', async () => {
    writeFileSync(join(fakeHome, '.bashrc'), '# bashrc\n', 'utf8');
    const result = await installCompletions('bash', cmds);
    expect(result.file).toBe(join(fakeHome, '.bashrc'));
    expect(readFileSync(join(fakeHome, '.bashrc'), 'utf8')).toContain(
      '.brika/completions/brika.bash'
    );
  });

  test('uninstall removes the scripts and the source lines', async () => {
    writeFileSync(join(fakeHome, '.zshrc'), '# existing\n', 'utf8');
    await installCompletions('zsh', cmds);
    expect(existsSync(join(fakeHome, '.brika', 'completions', 'brika.zsh'))).toBe(true);

    const cleaned = await uninstallCompletions();
    expect(existsSync(join(fakeHome, '.brika', 'completions', 'brika.zsh'))).toBe(false);
    expect(cleaned).toContain(join(fakeHome, '.brika', 'completions', 'brika.zsh'));

    const rc = readFileSync(join(fakeHome, '.zshrc'), 'utf8');
    expect(rc).not.toContain('Brika completions');
    expect(rc).not.toContain('.brika/completions/brika.zsh');
  });

  test('uninstall is a no-op when nothing is installed', async () => {
    const cleaned = await uninstallCompletions();
    expect(cleaned).toEqual([]);
  });
});

// ── extra coverage ───────────────────────────────────────────────────────────

const cmdsWithSubcommands = [
  defineCommand({
    name: 'hub',
    description: 'Hub commands',
    options: {
      verbose: { type: 'boolean', short: 'v', description: 'increase log verbosity' },
    },
    handler: () => {},
  }),
  defineCommand({
    name: 'plugins',
    description: 'Plugin tooling',
    handler: () => {},
  }),
  // A command with subcommands exercises the cwd / args branch of every
  // generator. One subcommand has options, one doesn't.
  {
    name: 'completions',
    description: 'Shell completions',
    subcommands: [
      defineCommand({
        name: 'install',
        description: 'Install shell completions',
        options: {
          shell: { type: 'string', short: 's', description: 'which shell' },
        },
        handler: () => {},
      }),
      defineCommand({
        name: 'uninstall',
        description: 'Remove shell completions',
        handler: () => {},
      }),
    ],
    handler: () => {},
  },
] satisfies Parameters<typeof generateCompletions>[0];

describe('generateCompletions — bash flavour details', () => {
  test('emits `complete -F _brika brika` and a per-command case clause', () => {
    const out = generateCompletions(cmdsWithSubcommands, 'bash');
    expect(out).toContain('complete -F _brika brika');
    expect(out).toContain('hub)');
    expect(out).toContain('--verbose');
    expect(out).toContain('-v');
  });

  test('emits subcommand dispatch for commands that have one', () => {
    const out = generateCompletions(cmdsWithSubcommands, 'bash');
    expect(out).toContain('completions)');
    expect(out).toContain('install');
    expect(out).toContain('uninstall');
    expect(out).toContain('--shell');
  });

  test('is deterministic — generating twice with the same input yields identical output', () => {
    const a = generateCompletions(cmdsWithSubcommands, 'bash');
    const b = generateCompletions(cmdsWithSubcommands, 'bash');
    expect(a).toBe(b);
  });
});

describe('generateCompletions — zsh flavour details', () => {
  test('emits subcommand `_describe` entries and an arg case per leaf', () => {
    const out = generateCompletions(cmdsWithSubcommands, 'zsh');
    expect(out).toContain('compdef _brika brika');
    expect(out).toContain('completions)');
    expect(out).toContain("'install:Install shell completions'");
    expect(out).toContain("'uninstall:Remove shell completions'");
    expect(out).toContain('--shell');
  });

  test('is deterministic across repeated invocations', () => {
    const a = generateCompletions(cmdsWithSubcommands, 'zsh');
    const b = generateCompletions(cmdsWithSubcommands, 'zsh');
    expect(a).toBe(b);
  });
});

describe('generateCompletions — fish flavour details', () => {
  test('emits per-subcommand registrations and option flags', () => {
    const out = generateCompletions(cmdsWithSubcommands, 'fish');
    expect(out).toContain('complete -c brika');
    expect(out).toContain("__fish_use_subcommand' -a hub");
    expect(out).toContain('-a install');
    expect(out).toContain('-a uninstall');
    expect(out).toContain('-l shell');
    expect(out).toContain('-l verbose');
  });

  test('is deterministic across repeated invocations', () => {
    const a = generateCompletions(cmdsWithSubcommands, 'fish');
    const b = generateCompletions(cmdsWithSubcommands, 'fish');
    expect(a).toBe(b);
  });
});

describe('install / uninstall completions — extra coverage', () => {
  let fakeHome: string;
  let homedirSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    fakeHome = mkdtempSync(join(tmpdir(), 'brika-completions-extra-'));
    homedirSpy = spyOn(os, 'homedir').mockReturnValue(fakeHome);
  });

  afterEach(() => {
    homedirSpy.mockRestore();
    rmSync(fakeHome, { recursive: true, force: true });
  });

  test('fish install writes to ~/.config/fish/completions/brika.fish', async () => {
    const result = await installCompletions('fish', cmds);
    const expected = join(fakeHome, '.config', 'fish', 'completions', 'brika.fish');
    expect(result.file).toBe(expected);
    expect(existsSync(expected)).toBe(true);
    expect(readFileSync(expected, 'utf8')).toContain('complete -c brika');
  });

  test('fish install is idempotent — the script can be reinstalled', async () => {
    const first = await installCompletions('fish', cmds);
    const second = await installCompletions('fish', cmds);
    // Fish never claims `alreadyInstalled` because its rc-less install
    // can always overwrite; both calls land at the same destination.
    expect(second.file).toBe(first.file);
    expect(second.alreadyInstalled).toBe(false);
  });

  test('bash is idempotent — second install reports alreadyInstalled', async () => {
    writeFileSync(join(fakeHome, '.bashrc'), '# bashrc\n', 'utf8');
    await installCompletions('bash', cmds);
    const second = await installCompletions('bash', cmds);
    expect(second.alreadyInstalled).toBe(true);
  });

  test('bash prefers .bash_profile when it exists', async () => {
    writeFileSync(join(fakeHome, '.bash_profile'), '# profile\n', 'utf8');
    writeFileSync(join(fakeHome, '.bashrc'), '# bashrc\n', 'utf8');
    const result = await installCompletions('bash', cmds);
    expect(result.file).toBe(join(fakeHome, '.bash_profile'));
    const profile = readFileSync(join(fakeHome, '.bash_profile'), 'utf8');
    expect(profile).toContain('# Brika completions');
    // .bashrc must be left untouched.
    expect(readFileSync(join(fakeHome, '.bashrc'), 'utf8')).toBe('# bashrc\n');
  });

  test('uninstall scrubs every shell that had a config', async () => {
    writeFileSync(join(fakeHome, '.zshrc'), '# zsh\n', 'utf8');
    writeFileSync(join(fakeHome, '.bashrc'), '# bash\n', 'utf8');
    await installCompletions('zsh', cmds);
    await installCompletions('bash', cmds);
    await installCompletions('fish', cmds);

    const cleaned = await uninstallCompletions();

    // All three script files were removed.
    expect(existsSync(join(fakeHome, '.brika', 'completions', 'brika.zsh'))).toBe(false);
    expect(existsSync(join(fakeHome, '.brika', 'completions', 'brika.bash'))).toBe(false);
    expect(existsSync(join(fakeHome, '.config', 'fish', 'completions', 'brika.fish'))).toBe(false);
    expect(cleaned).toContain(join(fakeHome, '.brika', 'completions', 'brika.zsh'));
    expect(cleaned).toContain(join(fakeHome, '.brika', 'completions', 'brika.bash'));
    expect(cleaned).toContain(join(fakeHome, '.config', 'fish', 'completions', 'brika.fish'));

    // Both rc files had their source lines scrubbed.
    expect(readFileSync(join(fakeHome, '.zshrc'), 'utf8')).not.toContain('.brika/completions');
    expect(readFileSync(join(fakeHome, '.bashrc'), 'utf8')).not.toContain('.brika/completions');
  });
});
