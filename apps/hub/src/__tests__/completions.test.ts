/**
 * Tests for CLI shell completion script generation
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Command } from '@/cli/command';
import { detectShell, generateCompletions, isShell, shellList } from '@/cli/completions';

// ── mock command factories ──────────────────────────────────────────────────

const noop = () => {};

/** Minimal command with no options or subcommands */
const simpleCmd = (name: string, description: string): Command => ({
  name,
  description,
  handler: noop,
});

/** Command with options */
const cmdWithOptions = (
  name: string,
  description: string,
  options: Command['options']
): Command => ({
  name,
  description,
  options,
  handler: noop,
});

/** Command with subcommands */
const cmdWithSubcommands = (
  name: string,
  description: string,
  subcommands: Command[]
): Command => ({
  name,
  description,
  subcommands,
  handler: noop,
});

// ── shared test fixtures ────────────────────────────────────────────────────

/** A minimal set of commands for basic tests */
const minimalCommands: Command[] = [
  simpleCmd('start', 'Start the server'),
  simpleCmd('stop', 'Stop the server'),
  simpleCmd('help', 'Show help'),
];

/** Commands with options (both long and short flags, string and boolean types) */
const commandsWithOptions: Command[] = [
  cmdWithOptions('start', 'Start the server', {
    port: { type: 'string', short: 'p', description: 'Port number' },
    verbose: { type: 'boolean', short: 'V', description: 'Verbose output' },
    config: { type: 'string', description: 'Config file path' },
  }),
  simpleCmd('stop', 'Stop the server'),
  simpleCmd('help', 'Show help'),
];

/** Commands with subcommands, some having their own options */
const commandsWithSubcommands: Command[] = [
  cmdWithSubcommands('plugin', 'Manage plugins', [
    cmdWithOptions('install', 'Install a plugin', {
      registry: { type: 'string', short: 'r', description: 'Registry URL' },
      force: { type: 'boolean', short: 'f', description: 'Force install' },
    }),
    simpleCmd('list', 'List plugins'),
    cmdWithOptions('remove', 'Remove a plugin', {
      purge: { type: 'boolean', description: 'Remove all data' },
    }),
    simpleCmd('help', 'Show plugin help'),
  ]),
  simpleCmd('start', 'Start the server'),
  simpleCmd('help', 'Show help'),
];

/** Commands combining options + subcommands for full coverage */
const fullCommands: Command[] = [
  cmdWithOptions('start', 'Start the server', {
    port: { type: 'string', short: 'p', description: 'Port number' },
    daemon: { type: 'boolean', short: 'd', description: 'Run as daemon' },
  }),
  cmdWithSubcommands('plugin', 'Manage plugins', [
    cmdWithOptions('install', 'Install a plugin', {
      registry: { type: 'string', short: 'r', description: 'Registry URL' },
    }),
    simpleCmd('list', 'List installed plugins'),
    simpleCmd('help', 'Show plugin help'),
  ]),
  simpleCmd('status', 'Show server status'),
  simpleCmd('help', 'Show help'),
];

// ── isShell ─────────────────────────────────────────────────────────────────

describe('isShell', () => {
  test('returns true for bash', () => {
    expect(isShell('bash')).toBe(true);
  });

  test('returns true for zsh', () => {
    expect(isShell('zsh')).toBe(true);
  });

  test('returns true for fish', () => {
    expect(isShell('fish')).toBe(true);
  });

  test('returns false for empty string', () => {
    expect(isShell('')).toBe(false);
  });

  test('returns false for unknown shell', () => {
    expect(isShell('powershell')).toBe(false);
  });

  test('returns false for sh', () => {
    expect(isShell('sh')).toBe(false);
  });

  test('returns false for uppercase variant', () => {
    expect(isShell('BASH')).toBe(false);
  });

  test('returns false for partial match', () => {
    expect(isShell('bas')).toBe(false);
  });
});

// ── shellList ───────────────────────────────────────────────────────────────

describe('shellList', () => {
  test('returns comma-separated shell names', () => {
    expect(shellList()).toBe('bash, zsh, fish');
  });

  test('contains all three supported shells', () => {
    const list = shellList();
    expect(list).toContain('bash');
    expect(list).toContain('zsh');
    expect(list).toContain('fish');
  });
});

// ── detectShell ─────────────────────────────────────────────────────────────

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

  test('detects bash from /bin/bash', () => {
    process.env.SHELL = '/bin/bash';
    expect(detectShell()).toBe('bash');
  });

  test('detects zsh from /bin/zsh', () => {
    process.env.SHELL = '/bin/zsh';
    expect(detectShell()).toBe('zsh');
  });

  test('detects fish from /usr/bin/fish', () => {
    process.env.SHELL = '/usr/bin/fish';
    expect(detectShell()).toBe('fish');
  });

  test('detects zsh from /usr/local/bin/zsh', () => {
    process.env.SHELL = '/usr/local/bin/zsh';
    expect(detectShell()).toBe('zsh');
  });

  test('returns null for unknown shell', () => {
    process.env.SHELL = '/bin/csh';
    expect(detectShell()).toBeNull();
  });

  test('returns null when SHELL is empty', () => {
    process.env.SHELL = '';
    expect(detectShell()).toBeNull();
  });

  test('returns null when SHELL is undefined', () => {
    delete process.env.SHELL;
    expect(detectShell()).toBeNull();
  });
});

// ── generateCompletions: bash ───────────────────────────────────────────────

describe('generateCompletions — bash', () => {
  describe('structure', () => {
    test('wraps in _brika function', () => {
      const output = generateCompletions(minimalCommands, 'bash');
      expect(output).toContain('_brika()');
      expect(output).toContain('complete -F _brika brika');
    });

    test('includes COMP_WORDS and COMP_CWORD setup', () => {
      const output = generateCompletions(minimalCommands, 'bash');
      expect(output).toContain('COMP_WORDS[COMP_CWORD]');
      expect(output).toContain('cword=$COMP_CWORD');
    });

    test('includes top-level compgen for commands at cword 1', () => {
      const output = generateCompletions(minimalCommands, 'bash');
      expect(output).toContain('if [[ $cword -eq 1 ]]; then');
      expect(output).toContain('compgen -W');
    });

    test('includes case statement for subcommands', () => {
      const output = generateCompletions(minimalCommands, 'bash');
      expect(output).toContain('case "${COMP_WORDS[1]}" in');
      expect(output).toContain('esac');
    });
  });

  describe('simple commands (no options)', () => {
    test('lists command names in the top-level word list', () => {
      const output = generateCompletions(minimalCommands, 'bash');
      // nameList puts user cmds first, then help last
      expect(output).toContain('start stop help');
    });

    test('filters out help from user commands section but appends it at end', () => {
      const output = generateCompletions(minimalCommands, 'bash');
      // The word list should be "start stop help" — help is always last
      expect(output).toMatch(/compgen -W "start stop help"/);
    });

    test('generates no case entries for simple commands', () => {
      const output = generateCompletions(minimalCommands, 'bash');
      // Simple commands with no options produce empty case body
      expect(output).not.toContain('start)');
      expect(output).not.toContain('stop)');
    });
  });

  describe('commands with options', () => {
    test('generates case entry for command with options', () => {
      const output = generateCompletions(commandsWithOptions, 'bash');
      expect(output).toContain('start)');
    });

    test('includes long flags in compgen word list', () => {
      const output = generateCompletions(commandsWithOptions, 'bash');
      expect(output).toContain('--port');
      expect(output).toContain('--verbose');
      expect(output).toContain('--config');
    });

    test('includes short flags in compgen word list', () => {
      const output = generateCompletions(commandsWithOptions, 'bash');
      expect(output).toContain('-p');
      expect(output).toContain('-V');
    });

    test('does not include short flag when not defined', () => {
      const output = generateCompletions(commandsWithOptions, 'bash');
      // config has no short — verify only --config appears, not a lone -c
      // We check the specific compgen line for start
      const startLine = output
        .split('\n')
        .find((l) => l.includes('start)') && l.includes('compgen'));
      expect(startLine).toContain('--config');
    });

    test('no case entry for command without options', () => {
      const output = generateCompletions(commandsWithOptions, 'bash');
      // stop has no options
      expect(output).not.toContain('stop)');
    });
  });

  describe('commands with subcommands', () => {
    test('generates nested case for parent command', () => {
      const output = generateCompletions(commandsWithSubcommands, 'bash');
      expect(output).toContain('plugin)');
    });

    test('shows subcommand names at cword 2', () => {
      const output = generateCompletions(commandsWithSubcommands, 'bash');
      expect(output).toContain('if [[ $cword -eq 2 ]]; then');
      // subcommand list: install list remove help (user cmds first, then help)
      expect(output).toContain('install list remove help');
    });

    test('generates nested case for subcommand with options', () => {
      const output = generateCompletions(commandsWithSubcommands, 'bash');
      expect(output).toContain('install)');
      expect(output).toContain('--registry');
      expect(output).toContain('-r');
      expect(output).toContain('--force');
      expect(output).toContain('-f');
    });

    test('generates nested case for remove subcommand with options', () => {
      const output = generateCompletions(commandsWithSubcommands, 'bash');
      expect(output).toContain('remove)');
      expect(output).toContain('--purge');
    });

    test('no nested case for subcommand without options', () => {
      const output = generateCompletions(commandsWithSubcommands, 'bash');
      // "list" subcommand has no options — should not appear as a case
      const lines = output.split('\n');
      const listCases = lines.filter((l) => l.trim().startsWith('list)') && l.includes('compgen'));
      expect(listCases).toHaveLength(0);
    });

    test('inner case uses COMP_WORDS[2]', () => {
      const output = generateCompletions(commandsWithSubcommands, 'bash');
      expect(output).toContain('${COMP_WORDS[2]}');
    });
  });

  describe('mixed commands', () => {
    test('handles mix of simple, option, and subcommand commands', () => {
      const output = generateCompletions(fullCommands, 'bash');
      // top-level names
      expect(output).toContain('start plugin status help');
      // start options
      expect(output).toContain('--port');
      expect(output).toContain('-p');
      expect(output).toContain('--daemon');
      expect(output).toContain('-d');
      // plugin subcommands
      expect(output).toContain('plugin)');
      expect(output).toContain('install list help');
      // install options
      expect(output).toContain('--registry');
      expect(output).toContain('-r');
    });
  });

  describe('edge cases', () => {
    test('empty commands array produces valid bash function', () => {
      const output = generateCompletions([simpleCmd('help', 'Show help')], 'bash');
      expect(output).toContain('_brika()');
      expect(output).toContain('complete -F _brika brika');
      // only help in the list
      expect(output).toContain('compgen -W "help"');
    });

    test('description with single quotes is escaped', () => {
      const commands: Command[] = [
        simpleCmd("it's", "it's a test"),
        simpleCmd('help', 'Show help'),
      ];
      // bash doesn't use esc() for descriptions in its word list, but zsh/fish do
      // bash only uses flags and names — verify it doesn't crash
      const output = generateCompletions(commands, 'bash');
      expect(output).toContain('_brika()');
    });
  });
});

// ── generateCompletions: zsh ────────────────────────────────────────────────

describe('generateCompletions — zsh', () => {
  describe('structure', () => {
    test('wraps in _brika function and registers with compdef', () => {
      const output = generateCompletions(minimalCommands, 'zsh');
      expect(output).toContain('_brika()');
      expect(output).toContain('compdef _brika brika');
    });

    test('uses _arguments with state machine', () => {
      const output = generateCompletions(minimalCommands, 'zsh');
      expect(output).toContain("_arguments -C '1:command:->command' '*::arg:->args'");
    });

    test('includes case state for command and args', () => {
      const output = generateCompletions(minimalCommands, 'zsh');
      expect(output).toContain('case $state in');
      expect(output).toContain("command) _describe 'brika command' commands ;;");
      expect(output).toContain('args)');
    });
  });

  describe('simple commands', () => {
    test('lists commands with descriptions', () => {
      const output = generateCompletions(minimalCommands, 'zsh');
      expect(output).toContain("'start:Start the server'");
      expect(output).toContain("'stop:Stop the server'");
    });

    test('excludes help from user commands list but includes it via _describe', () => {
      const output = generateCompletions(minimalCommands, 'zsh');
      // help is filtered from userCmds, so it should NOT appear in the commands array
      expect(output).not.toContain("'help:Show help'");
    });

    test('generates no args cases for simple commands', () => {
      const output = generateCompletions(minimalCommands, 'zsh');
      expect(output).not.toContain('start) _arguments');
      expect(output).not.toContain('stop) _arguments');
    });
  });

  describe('commands with options', () => {
    test('generates _arguments case for command with options', () => {
      const output = generateCompletions(commandsWithOptions, 'zsh');
      expect(output).toContain('start) _arguments');
    });

    test('includes long flag with description', () => {
      const output = generateCompletions(commandsWithOptions, 'zsh');
      expect(output).toContain('--port');
      expect(output).toContain('Port number');
    });

    test('generates paired short/long format for options with short flags', () => {
      const output = generateCompletions(commandsWithOptions, 'zsh');
      // zshOpt produces '(-p --port)'{-p,--port}'[Port number]:value'
      expect(output).toContain('(-p --port)');
      expect(output).toContain('{-p,--port}');
    });

    test('generates long-only format for options without short flags', () => {
      const output = generateCompletions(commandsWithOptions, 'zsh');
      // config has no short flag
      expect(output).toContain("'--config[Config file path]:value'");
    });

    test('adds :value suffix for string type options', () => {
      const output = generateCompletions(commandsWithOptions, 'zsh');
      // port is string type — should have :value
      expect(output).toContain(':value');
    });

    test('does not add :value suffix for boolean type options', () => {
      const output = generateCompletions(commandsWithOptions, 'zsh');
      // verbose is boolean — should not have :value in its zshOpt output
      // Find the verbose line specifically
      const lines = output.split('\n');
      const verboseLine = lines.find((l) => l.includes('--verbose'));
      expect(verboseLine).toBeDefined();
      expect(verboseLine).toContain('[Verbose output]');
      // Boolean should NOT end with :value — it should end with the closing quote
      expect(verboseLine).not.toContain('Verbose output]:value');
    });
  });

  describe('commands with subcommands', () => {
    test('generates nested case for parent command', () => {
      const output = generateCompletions(commandsWithSubcommands, 'zsh');
      expect(output).toContain('plugin)');
    });

    test('checks CURRENT for subcommand position', () => {
      const output = generateCompletions(commandsWithSubcommands, 'zsh');
      expect(output).toContain('if (( CURRENT == 2 )); then');
    });

    test('describes subcommands in subcmds array', () => {
      const output = generateCompletions(commandsWithSubcommands, 'zsh');
      expect(output).toContain("'install:Install a plugin'");
      expect(output).toContain("'list:List plugins'");
      expect(output).toContain("'remove:Remove a plugin'");
    });

    test('uses _describe for subcommand completion', () => {
      const output = generateCompletions(commandsWithSubcommands, 'zsh');
      expect(output).toContain("_describe 'plugin command' subcmds");
    });

    test('generates _arguments for subcommands with options', () => {
      const output = generateCompletions(commandsWithSubcommands, 'zsh');
      expect(output).toContain('install) _arguments');
      expect(output).toContain('--registry');
      expect(output).toContain('--force');
    });

    test('generates _arguments for remove subcommand', () => {
      const output = generateCompletions(commandsWithSubcommands, 'zsh');
      expect(output).toContain('remove) _arguments');
      expect(output).toContain('--purge');
    });

    test('no _arguments case for subcommand without options', () => {
      const output = generateCompletions(commandsWithSubcommands, 'zsh');
      // "list" has no options — should not have an _arguments line
      const lines = output.split('\n');
      const listArgs = lines.filter(
        (l) => l.trim().startsWith('list)') && l.includes('_arguments')
      );
      expect(listArgs).toHaveLength(0);
    });

    test('inner case uses $words[2]', () => {
      const output = generateCompletions(commandsWithSubcommands, 'zsh');
      expect(output).toContain('case $words[2] in');
    });
  });

  describe('escaping', () => {
    test('escapes single quotes in descriptions', () => {
      const commands: Command[] = [
        simpleCmd("won't", "it's a test"),
        simpleCmd('help', 'Show help'),
      ];
      const output = generateCompletions(commands, 'zsh');
      // esc() replaces ' with '\'' — in the output this appears as 'it'\''s a test'
      expect(output).toContain("it'\\''s a test");
    });

    test('handles option with no description', () => {
      const commands: Command[] = [
        cmdWithOptions('test', 'A test', {
          flag: { type: 'boolean' },
        }),
        simpleCmd('help', 'Show help'),
      ];
      const output = generateCompletions(commands, 'zsh');
      // description defaults to empty string via esc(o.description ?? '')
      expect(output).toContain("'--flag[]'");
    });
  });
});

// ── generateCompletions: fish ───────────────────────────────────────────────

describe('generateCompletions — fish', () => {
  describe('structure', () => {
    test('starts with complete -c brika -f', () => {
      const output = generateCompletions(minimalCommands, 'fish');
      expect(output).toMatch(/^complete -c brika -f\n/);
    });

    test('ends with a trailing newline', () => {
      const output = generateCompletions(minimalCommands, 'fish');
      expect(output).toEndWith('\n');
    });

    test('uses __fish_use_subcommand for top-level commands', () => {
      const output = generateCompletions(minimalCommands, 'fish');
      expect(output).toContain("__fish_use_subcommand'");
    });
  });

  describe('simple commands', () => {
    test('generates completion entries for each user command', () => {
      const output = generateCompletions(minimalCommands, 'fish');
      expect(output).toContain(
        "complete -c brika -n '__fish_use_subcommand' -a start -d 'Start the server'"
      );
      expect(output).toContain(
        "complete -c brika -n '__fish_use_subcommand' -a stop -d 'Stop the server'"
      );
    });

    test('excludes help from user commands', () => {
      const output = generateCompletions(minimalCommands, 'fish');
      // help is filtered via userCmds
      expect(output).not.toContain("-a help -d 'Show help'");
    });
  });

  describe('commands with options', () => {
    test('generates option completions with __fish_seen_subcommand_from', () => {
      const output = generateCompletions(commandsWithOptions, 'fish');
      expect(output).toContain("__fish_seen_subcommand_from start'");
    });

    test('includes long flag', () => {
      const output = generateCompletions(commandsWithOptions, 'fish');
      expect(output).toContain('-l port');
      expect(output).toContain('-l verbose');
      expect(output).toContain('-l config');
    });

    test('includes short flag when defined', () => {
      const output = generateCompletions(commandsWithOptions, 'fish');
      expect(output).toContain('-s p');
      expect(output).toContain('-s V');
    });

    test('does not include -s for options without short flag', () => {
      const output = generateCompletions(commandsWithOptions, 'fish');
      // config has no short flag — find its specific line
      const lines = output.split('\n');
      const configLine = lines.find((l) => l.includes('-l config'));
      expect(configLine).toBeDefined();
      expect(configLine).not.toContain(' -s ');
    });

    test('includes -r for string type options (requires argument)', () => {
      const output = generateCompletions(commandsWithOptions, 'fish');
      // port is string type — should have -r
      const lines = output.split('\n');
      const portLine = lines.find((l) => l.includes('-l port'));
      expect(portLine).toBeDefined();
      expect(portLine).toContain(' -r');
    });

    test('does not include -r for boolean type options', () => {
      const output = generateCompletions(commandsWithOptions, 'fish');
      const lines = output.split('\n');
      const verboseLine = lines.find((l) => l.includes('-l verbose'));
      expect(verboseLine).toBeDefined();
      expect(verboseLine).not.toContain(' -r');
    });

    test('includes description with -d flag', () => {
      const output = generateCompletions(commandsWithOptions, 'fish');
      expect(output).toContain("-d 'Port number'");
      expect(output).toContain("-d 'Verbose output'");
      expect(output).toContain("-d 'Config file path'");
    });

    test('omits -d when option has no description', () => {
      const commands: Command[] = [
        cmdWithOptions('test', 'A test', {
          flag: { type: 'boolean' },
        }),
        simpleCmd('help', 'Show help'),
      ];
      const output = generateCompletions(commands, 'fish');
      const lines = output.split('\n');
      const flagLine = lines.find((l) => l.includes('-l flag'));
      expect(flagLine).toBeDefined();
      expect(flagLine).not.toContain(' -d ');
    });
  });

  describe('commands with subcommands', () => {
    test('generates subcommand completions', () => {
      const output = generateCompletions(commandsWithSubcommands, 'fish');
      // subcommand entries should use condition that parent is seen but not sibling subs
      expect(output).toContain('-a install');
      expect(output).toContain('-a list');
      expect(output).toContain('-a remove');
    });

    test('subcommand condition prevents completing when another sub is active', () => {
      const output = generateCompletions(commandsWithSubcommands, 'fish');
      // The condition should be "__fish_seen_subcommand_from plugin; and not __fish_seen_subcommand_from install list remove"
      expect(output).toContain(
        '__fish_seen_subcommand_from plugin; and not __fish_seen_subcommand_from install list remove'
      );
    });

    test('generates options for subcommands with their own conditions', () => {
      const output = generateCompletions(commandsWithSubcommands, 'fish');
      // install's options should be conditioned on both plugin and install being seen
      expect(output).toContain(
        '__fish_seen_subcommand_from plugin; and __fish_seen_subcommand_from install'
      );
      expect(output).toContain('-l registry');
      expect(output).toContain('-l force');
    });

    test('generates options for remove subcommand', () => {
      const output = generateCompletions(commandsWithSubcommands, 'fish');
      expect(output).toContain(
        '__fish_seen_subcommand_from plugin; and __fish_seen_subcommand_from remove'
      );
      expect(output).toContain('-l purge');
    });

    test('no options generated for subcommand without options', () => {
      const output = generateCompletions(commandsWithSubcommands, 'fish');
      // "list" has no options — should not have a condition line with "list" in the options area
      const lines = output.split('\n');
      const listOptionLines = lines.filter(
        (l) =>
          l.includes('__fish_seen_subcommand_from list') &&
          !l.includes('not __fish_seen_subcommand_from')
      );
      expect(listOptionLines).toHaveLength(0);
    });
  });

  describe('commands with both options and subcommands', () => {
    test('parent command options use simple seen_subcommand_from condition', () => {
      const commands: Command[] = [
        {
          name: 'plugin',
          description: 'Manage plugins',
          options: {
            global: { type: 'boolean', short: 'g', description: 'Global scope' },
          },
          subcommands: [
            simpleCmd('install', 'Install a plugin'),
            simpleCmd('help', 'Show plugin help'),
          ],
          handler: noop,
        },
        simpleCmd('help', 'Show help'),
      ];
      const output = generateCompletions(commands, 'fish');
      // parent options should appear with the parent condition
      expect(output).toContain("__fish_seen_subcommand_from plugin' -l global -s g");
      // subcommands should also appear
      expect(output).toContain('-a install');
    });
  });

  describe('escaping', () => {
    test('escapes single quotes in command descriptions', () => {
      const commands: Command[] = [
        simpleCmd("it's", "it's a test"),
        simpleCmd('help', 'Show help'),
      ];
      const output = generateCompletions(commands, 'fish');
      // esc() replaces ' with '\'' — output contains 'it'\''s a test'
      expect(output).toContain("it'\\''s a test");
    });

    test('escapes single quotes in option descriptions', () => {
      const commands: Command[] = [
        cmdWithOptions('test', 'A test', {
          name: { type: 'string', description: "it's quoted" },
        }),
        simpleCmd('help', 'Show help'),
      ];
      const output = generateCompletions(commands, 'fish');
      expect(output).toContain("it'\\''s quoted");
    });
  });
});

// ── generateCompletions: cross-shell ────────────────────────────────────────

describe('generateCompletions — cross-shell', () => {
  test('all shells produce non-empty output', () => {
    for (const shell of ['bash', 'zsh', 'fish'] as const) {
      const output = generateCompletions(minimalCommands, shell);
      expect(output.length).toBeGreaterThan(0);
    }
  });

  test('all shells produce different output', () => {
    const bash = generateCompletions(fullCommands, 'bash');
    const zsh = generateCompletions(fullCommands, 'zsh');
    const fish = generateCompletions(fullCommands, 'fish');
    expect(bash).not.toBe(zsh);
    expect(bash).not.toBe(fish);
    expect(zsh).not.toBe(fish);
  });

  test('all shells include command names for the same input', () => {
    for (const shell of ['bash', 'zsh', 'fish'] as const) {
      const output = generateCompletions(fullCommands, shell);
      expect(output).toContain('start');
      expect(output).toContain('plugin');
      expect(output).toContain('status');
    }
  });

  test('all shells handle commands with options', () => {
    for (const shell of ['bash', 'zsh', 'fish'] as const) {
      const output = generateCompletions(commandsWithOptions, shell);
      // Fish uses `-l port` not `--port`, so check for the flag name generically
      expect(output).toContain('port');
      expect(output).toContain('verbose');
    }
    // Bash and zsh use -- prefix
    for (const shell of ['bash', 'zsh'] as const) {
      const output = generateCompletions(commandsWithOptions, shell);
      expect(output).toContain('--port');
      expect(output).toContain('--verbose');
    }
    // Fish uses -l prefix
    const fishOutput = generateCompletions(commandsWithOptions, 'fish');
    expect(fishOutput).toContain('-l port');
    expect(fishOutput).toContain('-l verbose');
  });

  test('all shells handle commands with subcommands', () => {
    for (const shell of ['bash', 'zsh', 'fish'] as const) {
      const output = generateCompletions(commandsWithSubcommands, shell);
      expect(output).toContain('install');
      expect(output).toContain('list');
      expect(output).toContain('remove');
    }
  });

  test('help is always moved to end of name lists', () => {
    const commands: Command[] = [
      simpleCmd('help', 'Show help'),
      simpleCmd('alpha', 'First command'),
      simpleCmd('beta', 'Second command'),
    ];
    const bash = generateCompletions(commands, 'bash');
    // nameList outputs user cmds first, help last
    expect(bash).toContain('alpha beta help');
  });

  test('only help command produces minimal output', () => {
    const commands: Command[] = [simpleCmd('help', 'Show help')];
    for (const shell of ['bash', 'zsh', 'fish'] as const) {
      const output = generateCompletions(commands, shell);
      expect(output.length).toBeGreaterThan(0);
    }
  });
});

// ── generateCompletions: detailed output verification ───────────────────────

describe('generateCompletions — output snapshots', () => {
  const singleOptionCmd: Command[] = [
    cmdWithOptions('run', 'Run something', {
      watch: { type: 'boolean', short: 'w', description: 'Watch mode' },
    }),
    simpleCmd('help', 'Show help'),
  ];

  test('bash: single option command produces correct structure', () => {
    const output = generateCompletions(singleOptionCmd, 'bash');
    const lines = output.split('\n');

    // Function declaration
    expect(lines[0]).toBe('_brika() {');
    // Last meaningful line is the complete command
    expect(lines[lines.length - 2]).toBe('complete -F _brika brika');
    // Case entry for run with options
    expect(output).toContain('run) COMPREPLY=($(compgen -W "--watch -w" -- "$cur")) ;;');
  });

  test('zsh: single option command produces correct _arguments', () => {
    const output = generateCompletions(singleOptionCmd, 'zsh');
    // Should have the run command in commands list
    expect(output).toContain("'run:Run something'");
    // _arguments call for run with paired short/long
    expect(output).toContain("'(-w --watch)'{-w,--watch}'[Watch mode]'");
  });

  test('fish: single option command produces correct complete lines', () => {
    const output = generateCompletions(singleOptionCmd, 'fish');
    const lines = output.split('\n').filter((l) => l.length > 0);
    // First line: disable file completions
    expect(lines[0]).toBe('complete -c brika -f');
    // Second line: run subcommand
    expect(lines[1]).toBe("complete -c brika -n '__fish_use_subcommand' -a run -d 'Run something'");
    // Third line: watch option
    expect(lines[2]).toBe(
      "complete -c brika -n '__fish_seen_subcommand_from run' -l watch -s w -d 'Watch mode'"
    );
  });

  test('zsh: string option without short flag', () => {
    const commands: Command[] = [
      cmdWithOptions('build', 'Build project', {
        target: { type: 'string', description: 'Build target' },
      }),
      simpleCmd('help', 'Show help'),
    ];
    const output = generateCompletions(commands, 'zsh');
    // Long-only with :value for string type
    expect(output).toContain("'--target[Build target]:value'");
  });

  test('fish: string option includes -r flag', () => {
    const commands: Command[] = [
      cmdWithOptions('build', 'Build project', {
        target: { type: 'string', description: 'Build target' },
      }),
      simpleCmd('help', 'Show help'),
    ];
    const output = generateCompletions(commands, 'fish');
    const lines = output.split('\n');
    const targetLine = lines.find((l) => l.includes('-l target'));
    expect(targetLine).toBeDefined();
    expect(targetLine).toContain(' -r ');
  });
});
