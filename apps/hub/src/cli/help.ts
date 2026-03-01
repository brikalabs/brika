import pc from 'picocolors';
import { HUB_REPO_URL, hub } from '@/hub';
import type { Command } from './command';

/**
 * Generate help text from command metadata.
 * @param prefix — CLI prefix for display (default: 'brika')
 */
export function generateHelp(commands: Command[], specific?: Command, prefix = 'brika'): string {
  return specific ? generateCommandHelp(specific, prefix) : generateGlobalHelp(commands, prefix);
}

function generateGlobalHelp(commands: Command[], prefix: string): string {
  const commandsSection = commands
    .map((cmd) => `  ${pc.green(cmd.name.padEnd(12))} ${cmd.description}`)
    .join('\n');

  if (prefix === 'brika') {
    return `
${pc.bold(pc.cyan('brika'))} - Build. Run. Integrate. Keep Automating.

${pc.bold('Usage:')}
  brika [command] [options]

${pc.bold('Global options:')}
  ${pc.green('-C, --cwd <path>'.padEnd(20))} Set the .brika data directory

${pc.bold('Commands:')}
${commandsSection}

${pc.bold('Examples:')}
  ${pc.dim('$')} brika                       ${pc.dim('# start with defaults')}
  ${pc.dim('$')} brika start -p 8080         ${pc.dim('# start on port 8080')}
  ${pc.dim('$')} brika -C ~/.brika status    ${pc.dim('# use a specific data dir')}
  ${pc.dim('$')} brika help start            ${pc.dim('# show start command help')}

${pc.dim(`v${hub.version} | ${HUB_REPO_URL}`)}
`.trim();
  }

  return `
${pc.bold(pc.cyan(prefix))}

${pc.bold('Usage:')}
  ${prefix} <command> [args]

${pc.bold('Commands:')}
${commandsSection}
`.trim();
}

function generateCommandHelp(cmd: Command, prefix: string): string {
  let flagsSection = '';
  if (cmd.options) {
    const flags = Object.entries(cmd.options)
      .map(([key, opt]) => {
        const shortPrefix = opt.short ? `-${opt.short}, ` : '';
        const nameStr = `${shortPrefix}--${key}`;
        const desc = opt.description ?? '';
        const defaultLabel = ` (default: ${opt.default})`;
        const def = opt.default === undefined ? '' : pc.dim(defaultLabel);
        return `  ${pc.green(nameStr.padEnd(20))} ${desc}${def}`;
      })
      .join('\n');
    flagsSection = `\n${pc.bold('Flags:')}\n${flags}`;
  }

  let examplesSection = '';
  if (cmd.examples) {
    const examples = cmd.examples.map((ex) => `  ${pc.dim('$')} ${ex}`).join('\n');
    examplesSection = `\n${pc.bold('Examples:')}\n${examples}`;
  }

  const details = cmd.details ? `\n\n${cmd.details}` : '';

  return `
${pc.bold(pc.cyan(`${prefix} ${cmd.name}`))}

${cmd.description}${details}
${flagsSection}${examplesSection}
`.trim();
}
