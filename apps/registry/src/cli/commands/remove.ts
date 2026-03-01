import * as p from '@clack/prompts';
import pc from 'picocolors';
import { modifyRegistry, readRegistry, readRegistryRaw, writeRegistryRaw } from '../../registry-io';
import type { Command } from '../index';
import { autoSign } from '../utils';

export const remove: Command = {
  name: 'remove',
  description: 'Remove plugin(s) from the registry (auto-signs)',
  async run() {
    p.intro(pc.bgCyan(pc.black(' registry-cli — remove plugin ')));

    const registry = readRegistry();

    if (registry.plugins.length === 0) {
      p.log.warn('No plugins in the registry to remove.');
      p.outro(pc.dim('Nothing to do'));
      return;
    }

    const selected = await p.multiselect({
      message: 'Select plugin(s) to remove',
      options: registry.plugins.map((pl) => ({
        value: pl.name,
        label: pc.cyan(pl.name),
        hint: [
          pl.category,
          pl.featured ? 'featured' : '',
        ]
          .filter(Boolean)
          .join(', '),
      })),
      required: true,
    });

    if (p.isCancel(selected)) {
      p.cancel('Remove cancelled.');
      throw new Error('cancelled');
    }

    const toRemove = new Set(selected);
    const count = toRemove.size;

    const confirmed = await p.confirm({
      message: `Remove ${pc.bold(String(count))} plugin${count === 1 ? '' : 's'}?`,
      initialValue: false,
    });

    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel('Remove cancelled.');
      throw new Error('cancelled');
    }

    // Remove from end to preserve indices
    let content = readRegistryRaw();
    const indicesToRemove = registry.plugins
      .map((pl, i) => (toRemove.has(pl.name) ? i : -1))
      .filter((i) => i >= 0)
      .reverse();

    for (const idx of indicesToRemove) {
      content = modifyRegistry(
        content,
        [
          'plugins',
          idx,
        ],
        undefined
      );
    }

    content = modifyRegistry(
      content,
      [
        'lastUpdated',
      ],
      new Date().toISOString()
    );
    writeRegistryRaw(content);

    for (const name of toRemove) {
      p.log.success(`${pc.bold(name)} removed`);
    }

    autoSign();

    p.outro(pc.green(`${count} plugin${count === 1 ? '' : 's'} removed`));
  },
};
