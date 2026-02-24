import * as p from '@clack/prompts';
import pc from 'picocolors';
import { modifyRegistry, readRegistry, readRegistryRaw, writeRegistryRaw } from '../../registry-io';
import { PluginCategory, PluginSource } from '../../schema';
import type { Command } from '../index';
import { autoSign, parseTags, sourceHint } from '../utils';

export const edit: Command = {
  name: 'edit',
  description: 'Edit a plugin entry (auto-signs)',
  async run() {
    p.intro(pc.bgCyan(pc.black(' registry-cli — edit plugin ')));

    const registry = readRegistry();

    if (registry.plugins.length === 0) {
      p.log.warn('No plugins in the registry to edit.');
      p.outro(pc.dim('Nothing to do'));
      return;
    }

    const selectedName = await p.select({
      message: 'Select a plugin to edit',
      options: registry.plugins.map((pl) => ({
        value: pl.name,
        label: pc.cyan(pl.name),
        hint: pl.category,
      })),
    });

    if (p.isCancel(selectedName)) {
      p.cancel('Edit cancelled.');
      throw new Error('cancelled');
    }

    const pluginIdx = registry.plugins.findIndex((pl) => pl.name === selectedName);
    const plugin = registry.plugins[pluginIdx];

    // Show current values
    p.log.step('Current values:');
    console.log(`  ${pc.dim('description:')} ${plugin.description || pc.dim('(none)')}`);
    console.log(
      `  ${pc.dim('tags:')}        ${(plugin.tags ?? []).join(', ') || pc.dim('(none)')}`
    );
    console.log(`  ${pc.dim('category:')}    ${plugin.category}`);
    console.log(`  ${pc.dim('source:')}      ${plugin.source}`);
    console.log(`  ${pc.dim('featured:')}    ${plugin.featured ? 'yes' : 'no'}`);
    console.log(`  ${pc.dim('verifiedBy:')}  ${plugin.verifiedBy}`);
    console.log(`  ${pc.dim('minVersion:')}  ${plugin.minVersion ?? pc.dim('(none)')}`);

    const answers = await p.group(
      {
        description: () =>
          p.text({
            message: 'Description (Enter to keep current)',
            initialValue: plugin.description,
          }),

        tags: () =>
          p.text({
            message: 'Tags — comma-separated (Enter to keep current)',
            initialValue: (plugin.tags ?? []).join(', '),
          }),

        category: () =>
          p.select({
            message: 'Category',
            options: PluginCategory.options.map((cat) => ({
              value: cat,
              label: cat.charAt(0).toUpperCase() + cat.slice(1),
            })),
            initialValue: plugin.category as string,
          }),

        source: () =>
          p.select({
            message: 'Source',
            options: PluginSource.options.map((src) => ({
              value: src,
              label: src,
              hint: sourceHint(src),
            })),
            initialValue: plugin.source as string,
          }),

        featured: () =>
          p.confirm({
            message: 'Featured?',
            initialValue: plugin.featured,
          }),

        verifiedBy: () =>
          p.text({
            message: 'Verified by',
            initialValue: plugin.verifiedBy,
          }),

        minVersion: () =>
          p.text({
            message: 'Minimum Brika version (empty for none)',
            initialValue: plugin.minVersion ?? '',
            validate: (value) => {
              if (value && !/^\d+\.\d+\.\d+$/.test(value)) {
                return 'Must be a semver version (x.y.z) or empty';
              }
            },
          }),
      },
      {
        onCancel: () => {
          p.cancel('Edit cancelled.');
          throw new Error('cancelled');
        },
      }
    );

    const tags = parseTags(answers.tags);

    const confirmed = await p.confirm({
      message: 'Save changes?',
      initialValue: true,
    });

    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel('Edit cancelled.');
      throw new Error('cancelled');
    }

    let content = readRegistryRaw();
    const path = ['plugins', pluginIdx] as const;
    content = modifyRegistry(content, [...path, 'description'], answers.description);
    content = modifyRegistry(content, [...path, 'tags'], tags);
    content = modifyRegistry(content, [...path, 'category'], answers.category);
    content = modifyRegistry(content, [...path, 'source'], answers.source);
    content = modifyRegistry(content, [...path, 'featured'], answers.featured);
    content = modifyRegistry(content, [...path, 'verifiedBy'], answers.verifiedBy);

    if (answers.minVersion) {
      content = modifyRegistry(content, [...path, 'minVersion'], answers.minVersion);
    }

    content = modifyRegistry(content, ['lastUpdated'], new Date().toISOString());
    writeRegistryRaw(content);

    autoSign();

    p.outro(pc.green(`${pc.bold(plugin.name)} updated`));
  },
};
