import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { Command, CommandOption } from './command';

export type Shell = 'bash' | 'zsh' | 'fish';

const SHELLS: Shell[] = ['bash', 'zsh', 'fish'];
const RC_MATCH = '.brika/completions/brika.';
const RC_MARKER = '# Brika completions';

export const isShell = (v: string): v is Shell => SHELLS.includes(v as Shell);
export const shellList = () => SHELLS.join(', ');

// ── shell helpers ────────────────────────────────────────────────────────────

export function detectShell(): Shell | null {
  const name = basename(process.env.SHELL ?? '');
  return isShell(name) ? name : null;
}

function rcFile(shell: Shell): string {
  const home = homedir();
  if (shell === 'zsh') {
    return join(home, '.zshrc');
  }
  if (shell === 'fish') {
    return join(home, '.config', 'fish', 'config.fish');
  }
  return existsSync(join(home, '.bash_profile'))
    ? join(home, '.bash_profile')
    : join(home, '.bashrc');
}

function scriptFile(shell: Shell): string {
  if (shell === 'fish') {
    return join(homedir(), '.config', 'fish', 'completions', 'brika.fish');
  }
  return join(homedir(), '.brika', 'completions', `brika.${shell}`);
}

// ── install / uninstall ──────────────────────────────────────────────────────

export async function installCompletions(
  shell: Shell,
  commands: Command[]
): Promise<{
  file: string;
  alreadyInstalled: boolean;
}> {
  const dest = scriptFile(shell);
  await mkdir(dirname(dest), {
    recursive: true,
  });
  await writeFile(dest, generateCompletions(commands, shell));

  // Fish auto-discovers ~/.config/fish/completions/ — no rc entry needed
  if (shell === 'fish') {
    return {
      file: dest,
      alreadyInstalled: false,
    };
  }

  const rc = rcFile(shell);
  if (existsSync(rc) && (await readFile(rc, 'utf8')).includes(RC_MATCH)) {
    return {
      file: dest,
      alreadyInstalled: true,
    };
  }

  const src = `~/.brika/completions/brika.${shell}`;
  await appendFile(rc, `\n${RC_MARKER}\n[ -f ${src} ] && source ${src}\n`);
  return {
    file: rc,
    alreadyInstalled: false,
  };
}

const RC_PATHS = ['.zshrc', '.bashrc', '.bash_profile', '.profile', '.config/fish/config.fish'];

export async function uninstallCompletions(): Promise<string[]> {
  const cleaned: string[] = [];

  for (const shell of SHELLS) {
    const file = scriptFile(shell);
    if (existsSync(file)) {
      await rm(file, {
        force: true,
      });
      cleaned.push(file);
    }
  }

  for (const rel of RC_PATHS) {
    const file = join(homedir(), rel);
    if (!existsSync(file)) {
      continue;
    }
    try {
      const content = await readFile(file, 'utf8');
      if (!content.includes(RC_MATCH)) {
        continue;
      }
      const lines = content.split('\n');
      const filtered = lines.filter((line, i) => {
        if (line.includes(RC_MATCH)) {
          return false;
        }
        if (line === RC_MARKER && lines[i + 1]?.includes(RC_MATCH)) {
          return false;
        }
        return true;
      });
      await writeFile(file, filtered.join('\n'), 'utf8');
      cleaned.push(file);
    } catch {
      // Non-critical
    }
  }

  return cleaned;
}

// ── script generation ────────────────────────────────────────────────────────

export function generateCompletions(commands: Command[], shell: Shell): string {
  return {
    bash: bashScript,
    zsh: zshScript,
    fish: fishScript,
  }[shell](commands);
}

// ── shared ───────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replaceAll("'", String.raw`'\''`);
const userCmds = (list: Command[]) => list.filter((c) => c.name !== 'help');
const nameList = (list: Command[]) => [...userCmds(list).map((c) => c.name), 'help'].join(' ');
const flags = (opts: Record<string, CommandOption>) =>
  Object.entries(opts)
    .flatMap(([l, o]) => (o.short ? [`--${l}`, `-${o.short}`] : [`--${l}`]))
    .join(' ');

// ── bash ─────────────────────────────────────────────────────────────────────

function bashScript(commands: Command[]): string {
  const cases = userCmds(commands).flatMap((cmd): string[] => {
    if (cmd.subcommands) {
      const subCases = userCmds(cmd.subcommands).flatMap((s) =>
        s.options
          ? [`        ${s.name}) COMPREPLY=($(compgen -W "${flags(s.options)}" -- "$cur")) ;;`]
          : []
      );
      return [
        `    ${cmd.name})`,
        `      if [[ $cword -eq 2 ]]; then`,
        `        COMPREPLY=($(compgen -W "${nameList(cmd.subcommands)}" -- "$cur"))`,
        `      else`,
        `        case "\${COMP_WORDS[2]}" in`,
        ...subCases,
        `        esac`,
        `      fi ;;`,
      ];
    }
    return cmd.options
      ? [`    ${cmd.name}) COMPREPLY=($(compgen -W "${flags(cmd.options)}" -- "$cur")) ;;`]
      : [];
  });

  return `_brika() {
  local cur="\${COMP_WORDS[COMP_CWORD]}" cword=$COMP_CWORD
  if [[ $cword -eq 1 ]]; then
    COMPREPLY=($(compgen -W "${nameList(commands)}" -- "$cur"))
    return
  fi
  case "\${COMP_WORDS[1]}" in
${cases.join('\n')}
  esac
}
complete -F _brika brika
`;
}

// ── zsh ──────────────────────────────────────────────────────────────────────

function zshOpt(long: string, o: CommandOption): string {
  const d = esc(o.description ?? '');
  const t = o.type === 'string' ? ':value' : '';
  return o.short
    ? `'(-${o.short} --${long})'{-${o.short},--${long}}'[${d}]${t}'`
    : `'--${long}[${d}]${t}'`;
}

function zshArgs(opts: Record<string, CommandOption>, indent: string): string {
  return Object.entries(opts)
    .map(([k, v]) => `${indent}${zshOpt(k, v)}`)
    .join(' \\\n');
}

function zshScript(commands: Command[]): string {
  const cmdList = userCmds(commands)
    .map((c) => `    '${c.name}:${esc(c.description)}'`)
    .join('\n');

  const argCases = userCmds(commands).flatMap((cmd): string[] => {
    if (cmd.subcommands) {
      const subs = userCmds(cmd.subcommands);
      const subList = subs.map((s) => `          '${s.name}:${esc(s.description)}'`).join('\n');
      const subArgs = subs.flatMap((s) =>
        s.options
          ? [`          ${s.name}) _arguments \\\n${zshArgs(s.options, '            ')} ;;`]
          : []
      );
      return [
        `      ${cmd.name})`,
        `        if (( CURRENT == 2 )); then`,
        `          local -a subcmds=(`,
        subList,
        `          )`,
        `          _describe '${cmd.name} command' subcmds`,
        `        else`,
        `          case $words[2] in`,
        ...subArgs,
        `          esac`,
        `        fi ;;`,
      ];
    }
    return cmd.options
      ? [`      ${cmd.name}) _arguments \\\n${zshArgs(cmd.options, '        ')} ;;`]
      : [];
  });

  return `_brika() {
  local -a commands=(
${cmdList}
  )
  _arguments -C '1:command:->command' '*::arg:->args'
  case $state in
    command) _describe 'brika command' commands ;;
    args)
      case $words[1] in
${argCases.join('\n')}
      esac ;;
  esac
}
compdef _brika brika
`;
}

// ── fish ─────────────────────────────────────────────────────────────────────

function fishOpt(cond: string, long: string, o: CommandOption): string {
  let s = `complete -c brika -n '${cond}' -l ${long}`;
  if (o.short) {
    s += ` -s ${o.short}`;
  }
  if (o.type === 'string') {
    s += ' -r';
  }
  if (o.description) {
    s += ` -d '${esc(o.description)}'`;
  }
  return s;
}

function fishOpts(cond: string, opts: Record<string, CommandOption>): string[] {
  return Object.entries(opts).map(([l, o]) => fishOpt(cond, l, o));
}

function fishScript(commands: Command[]): string {
  const lines = ['complete -c brika -f', ''];

  for (const cmd of userCmds(commands)) {
    lines.push(
      `complete -c brika -n '__fish_use_subcommand' -a ${cmd.name} -d '${esc(cmd.description)}'`
    );
    if (cmd.options) {
      lines.push(...fishOpts(`__fish_seen_subcommand_from ${cmd.name}`, cmd.options));
    }
    if (cmd.subcommands) {
      const subs = userCmds(cmd.subcommands);
      const subNames = subs.map((s) => s.name).join(' ');
      for (const sub of subs) {
        lines.push(
          `complete -c brika -n '__fish_seen_subcommand_from ${cmd.name}; and not __fish_seen_subcommand_from ${subNames}' -a ${sub.name} -d '${esc(sub.description)}'`
        );
        if (sub.options) {
          lines.push(
            ...fishOpts(
              `__fish_seen_subcommand_from ${cmd.name}; and __fish_seen_subcommand_from ${sub.name}`,
              sub.options
            )
          );
        }
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}
