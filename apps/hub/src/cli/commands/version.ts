import { dirname } from 'node:path';
import pc from 'picocolors';
import { hub } from '@/hub';
import type { Command } from '../command';

const installDir = dirname(process.execPath);

export default {
  name: 'version',
  aliases: ['-v', '--version'],
  description: 'Show version and platform info',
  examples: ['brika version', 'brika -v'],
  handler() {
    const bunBinary = process.platform === 'win32' ? 'bun.exe' : 'bun';
    const hasBundledBun = installDir.includes('bun');
    const bundledBun = hasBundledBun ? pc.green(bunBinary) : pc.yellow('no (using PATH)');
    const versionStr = pc.green('v' + hub.version);

    console.log(`${pc.bold(pc.cyan('brika'))} ${versionStr}`);
    console.log();
    console.log(`  ${pc.dim('Platform:')}  ${process.platform}/${process.arch}`);
    console.log(`  ${pc.dim('Runtime:')}   Bun ${Bun.version}`);
    console.log(`  ${pc.dim('Bundled:')}   ${bundledBun}`);
    console.log(`  ${pc.dim('Install:')}   ${installDir}`);
  },
} satisfies Command;
