import pc from 'picocolors';
import { buildInfo } from '@/build-info';
import { hub } from '@/hub';
import { defineCommand } from '../command';
import { dataDir, installDir } from '../utils/runtime';

export default defineCommand({
  name: 'version',
  aliases: ['-v', '--version'],
  description: 'Show version and platform info',
  examples: ['brika version', 'brika -v', 'brika version --json'],
  options: {
    json: { type: 'boolean', description: 'Output as JSON' },
  },
  handler({ values }) {
    if (values.json) {
      console.log(
        JSON.stringify({
          version: hub.version,
          commit: buildInfo.commit,
          platform: `${process.platform}/${process.arch}`,
          runtime: Bun.version,
          date: buildInfo.date,
        })
      );
      return;
    }

    const commit = pc.dim(`(${buildInfo.commit})`);
    console.log(`${pc.bold(pc.cyan('brika'))} ${pc.green('v' + hub.version)} ${commit}`);
    console.log();
    console.log(`  ${pc.dim('Platform:')}  ${process.platform}/${process.arch}`);
    console.log(`  ${pc.dim('Runtime:')}   Bun ${Bun.version}`);
    console.log(`  ${pc.dim('Built:')}     ${new Date(buildInfo.date).toLocaleString()}`);
    console.log(`  ${pc.dim('Install:')}   ${installDir}`);
    console.log(`  ${pc.dim('Data:')}      ${dataDir}`);
  },
});
