import * as p from '@clack/prompts';
import pc from 'picocolors';
import { readRegistry } from '../../registry-io';
import type { Command } from '../index';

export const list: Command = {
  name: 'list',
  description: 'List all plugins in the registry',
  run() {
    const registry = readRegistry();

    console.log();
    const versionLabel = `(v${registry.version})`;
    const updatedLabel = `Last updated: ${registry.lastUpdated}`;
    console.log(`  ${pc.bold('Brika Verified Plugins')} ${pc.dim(versionLabel)}`);
    console.log(`  ${pc.dim(updatedLabel)}`);
    console.log();

    if (registry.plugins.length === 0) {
      p.log.warn('No plugins in the registry.');
      return;
    }

    // Table header
    const nameCol = 36;
    const srcCol = 10;
    const catCol = 14;
    const featCol = 10;
    const signCol = 8;

    console.log(
      `  ${pc.dim('NAME'.padEnd(nameCol))}${pc.dim('SOURCE'.padEnd(srcCol))}${pc.dim('CATEGORY'.padEnd(catCol))}${pc.dim('FEATURED'.padEnd(featCol))}${pc.dim('SIGNED'.padEnd(signCol))}${pc.dim('TAGS')}`
    );

    for (const plugin of registry.plugins) {
      const name = pc.cyan(plugin.name.padEnd(nameCol));
      const source = (plugin.source ?? 'npm').padEnd(srcCol);
      const category = (plugin.category ?? 'community').padEnd(catCol);
      const featured = (plugin.featured ? pc.yellow('★') : ' ').padEnd(featCol);
      const signed = (plugin.signature ? pc.green('✓') : pc.red('✗')).padEnd(signCol);
      const tags = pc.dim((plugin.tags ?? []).join(', '));

      console.log(`  ${name}${source}${category}${featured}${signed}${tags}`);
    }

    const signedCount = registry.plugins.filter((p) => p.signature).length;
    console.log();
    console.log(`  ${registry.plugins.length} plugins (${signedCount} signed)`);
    console.log();
  },
};
