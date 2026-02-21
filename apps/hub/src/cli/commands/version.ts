import pc from 'picocolors';
import { hub } from '@/hub';
import type { Command } from '../command';
import { installDir } from '../utils/runtime';

export default {
  name: 'version',
  aliases: ['-v', '--version'],
  description: 'Show version and platform info',
  examples: ['brika version', 'brika -v'],
  handler() {
    console.log(`${pc.bold(pc.cyan('brika'))} ${pc.green('v' + hub.version)}`);
    console.log();
    console.log(`  ${pc.dim('Platform:')}  ${process.platform}/${process.arch}`);
    console.log(`  ${pc.dim('Runtime:')}   Bun ${Bun.version}`);
    console.log(`  ${pc.dim('Install:')}   ${installDir}`);
  },
} satisfies Command;
