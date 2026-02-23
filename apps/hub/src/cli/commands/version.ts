import pc from 'picocolors';
import { getBuildDate, getGitCommit } from '@/build-info.macro' with { type: 'macro' };
import { hub } from '@/hub';
import { defineCommand } from '../command';
import { installDir } from '../utils/runtime';

const commit = getGitCommit();
const buildDate = getBuildDate();

export default defineCommand({
  name: 'version',
  aliases: ['-v', '--version'],
  description: 'Show version and platform info',
  examples: ['brika version', 'brika -v'],
  handler() {
    const commitLabel = `(${commit})`;
    console.log(
      `${pc.bold(pc.cyan('brika'))} ${pc.green('v' + hub.version)} ${pc.dim(commitLabel)}`
    );
    console.log();
    console.log(`  ${pc.dim('Platform:')}  ${process.platform}/${process.arch}`);
    console.log(`  ${pc.dim('Runtime:')}   Bun ${Bun.version}`);
    console.log(`  ${pc.dim('Built:')}     ${new Date(buildDate).toLocaleString()}`);
    console.log(`  ${pc.dim('Install:')}   ${installDir}`);
  },
});
