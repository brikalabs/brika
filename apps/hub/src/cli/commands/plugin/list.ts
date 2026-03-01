import pc from 'picocolors';
import { defineCommand } from '../../command';
import { hubFetchOk } from '../../utils/hub-client';

export default defineCommand({
  name: 'list',
  aliases: ['ls'],
  description: 'List installed plugins',
  examples: ['brika plugin list'],
  async handler() {
    const res = await hubFetchOk('/api/registry/packages');

    const { packages } = (await res.json()) as {
      packages: {
        name: string;
        version: string;
        path: string;
      }[];
    };

    if (packages.length === 0) {
      console.log(pc.dim('No plugins installed.'));
      return;
    }

    console.log(pc.bold('Installed plugins:\n'));
    for (const pkg of packages) {
      console.log(`  ${pc.green(pkg.name.padEnd(36))} ${pc.dim(pkg.version)}`);
    }
    console.log();
  },
});
