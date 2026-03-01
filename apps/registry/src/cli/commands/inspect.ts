import { canonicalize, verifyWithRawKey } from '@brika/registry';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { readRegistry } from '../../registry-io';
import { extractPluginSignablePayload } from '../../schema';
import type { Command } from '../index';
import { resolvePublicKey } from '../utils';

export const inspect: Command = {
  name: 'inspect',
  description: 'Show detailed info for a plugin',
  async run(args) {
    const registry = readRegistry();

    if (registry.plugins.length === 0) {
      p.log.warn('No plugins in the registry.');
      return;
    }

    let pluginName = args[0];

    if (!pluginName) {
      const selected = await p.select({
        message: 'Select a plugin to inspect',
        options: registry.plugins.map((pl) => ({
          value: pl.name,
          label: pl.name,
          hint: pl.category,
        })),
      });

      if (p.isCancel(selected)) {
        p.cancel('Inspect cancelled.');
        throw new Error('cancelled');
      }

      pluginName = selected;
    }

    const plugin = registry.plugins.find((pl) => pl.name === pluginName);
    if (!plugin) {
      p.log.error(`Plugin ${pc.bold(pluginName)} not found in registry.`);
      process.exit(1);
      return;
    }

    console.log();
    console.log(`  ${pc.bold(pc.cyan(plugin.name))}`);
    console.log();

    const field = (label: string, value: string) =>
      console.log(`  ${pc.dim(label.padEnd(16))} ${value}`);

    field('Description', plugin.description || pc.dim('(none)'));
    field('Category', plugin.category);
    field('Source', plugin.source);
    field('Featured', plugin.featured ? pc.yellow('yes') : 'no');
    field('Verified at', plugin.verifiedAt);
    field('Verified by', plugin.verifiedBy);
    field('Min version', plugin.minVersion ?? pc.dim('(any)'));
    field('Tags', plugin.tags.length > 0 ? plugin.tags.join(', ') : pc.dim('(none)'));

    if (plugin.signature) {
      const pubKeyBase64 = resolvePublicKey(registry);
      const payload = extractPluginSignablePayload(plugin);
      const valid = verifyWithRawKey(canonicalize(payload), plugin.signature, pubKeyBase64);
      const truncSig = `${plugin.signature.slice(0, 24)}...${plugin.signature.slice(-8)}`;
      field('Signature', `${truncSig} ${valid ? pc.green('(valid)') : pc.red('(INVALID)')}`);
    } else {
      field('Signature', pc.red('unsigned'));
    }

    console.log();
  },
};
