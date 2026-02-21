import pc from 'picocolors';
import { HUB_REPO_URL, hub } from '@/hub';
import type { Command } from './command';

/**
 * Generate help text from command metadata.
 */
export function generateHelp(commands: Command[], specific?: Command): string {
  return specific ? generateCommandHelp(specific) : generateGlobalHelp(commands);
}

function generateGlobalHelp(commands: Command[]): string {
  const commandsSection = commands
    .map((cmd) => `  ${pc.green(cmd.name.padEnd(12))} ${cmd.description}`)
    .join('\n');

  return `
${pc.bold(pc.cyan('brika'))} - Build. Run. Integrate. Keep Automating.

${pc.bold('Usage:')}
  brika [command] [options]

${pc.bold('Commands:')}
${commandsSection}

${pc.bold('Examples:')}
  ${pc.dim('$')} brika                       ${pc.dim('# start with defaults')}
  ${pc.dim('$')} brika start -p 8080         ${pc.dim('# start on port 8080')}
  ${pc.dim('$')} brika help start            ${pc.dim('# show start command help')}

${pc.dim('v' + hub.version + ' | ' + HUB_REPO_URL)}
`.trim();
}

function generateCommandHelp(cmd: Command): string {
  let flagsSection = '';
  if (cmd.options) {
    const flags = Object.entries(cmd.options)
      .map(([key, opt]) => {
        const nameStr = `${opt.short ? `-${opt.short}, ` : ''}--${key}`;
        return `  ${pc.green(nameStr.padEnd(20))} ${opt.description ?? ''}`;
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
${pc.bold(pc.cyan('brika ' + cmd.name))}

${cmd.description}${details}
${flagsSection}${examplesSection}
`.trim();
}
