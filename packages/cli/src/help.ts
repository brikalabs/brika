import pc from 'picocolors';
import type { Command } from './command';

export function generateHelp(commands: Command[], specific?: Command, prefix = 'cli'): string {
  return specific ? generateCommandHelp(specific, prefix) : generateGlobalHelp(commands, prefix);
}

function generateGlobalHelp(commands: Command[], prefix: string): string {
  const commandsSection = commands
    .map((cmd) => `  ${pc.green(cmd.name.padEnd(12))} ${cmd.description}`)
    .join('\n');

  return `
${pc.bold(pc.cyan(prefix))}

${pc.bold('Usage:')}
  ${prefix} <command> [options]

${pc.bold('Commands:')}
${commandsSection}
`.trim();
}

export function generateCommandHelp(cmd: Command, prefix: string): string {
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
