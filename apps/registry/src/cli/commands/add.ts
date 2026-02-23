import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { Command } from '../index';
import { autoSign, parseTags, sourceHint } from '../utils';
import { npmNamePattern, PluginCategory, PluginSource } from '../../schema';
import { modifyRegistry, readRegistry, readRegistryRaw, writeRegistryRaw } from '../../registry-io';

export const add: Command = {
	name: 'add',
	description: 'Add a plugin to the registry (auto-signs)',
	async run() {
		p.intro(pc.bgCyan(pc.black(' registry-cli — add plugin ')));

		const registry = readRegistry();
		const existingNames = new Set(registry.plugins.map((pl) => pl.name));

		const answers = await p.group(
			{
				name: () =>
					p.text({
						message: 'Package name',
						placeholder: '@brika/plugin-name',
						validate: (value = '') => {
							if (!npmNamePattern.test(value)) return 'Must be a valid npm package name';
							if (existingNames.has(value)) return 'Plugin already exists in registry';
						},
					}),

				description: () =>
					p.text({
						message: 'Description',
						placeholder: 'Brief description of the plugin',
					}),

				tags: () =>
					p.text({
						message: 'Tags (comma-separated)',
						placeholder: 'utility, api, integration',
						defaultValue: '',
					}),

				category: () =>
					p.select({
						message: 'Category',
						options: PluginCategory.options.map((cat) => ({
							value: cat,
							label: cat.charAt(0).toUpperCase() + cat.slice(1),
						})),
						initialValue: 'community' as string,
					}),

				source: () =>
					p.select({
						message: 'Source',
						options: PluginSource.options.map((src) => ({
							value: src,
							label: src,
							hint: sourceHint(src),
						})),
						initialValue: 'npm' as string,
					}),

				featured: () =>
					p.confirm({
						message: 'Featured?',
						initialValue: false,
					}),

				verifiedBy: () =>
					p.text({
						message: 'Verified by',
						initialValue: 'maintainer',
					}),
			},
			{
				onCancel: () => {
					p.cancel('Add cancelled.');
					throw new Error('cancelled');
				},
			},
		);

		const tags = parseTags(answers.tags);

		const entry = {
			name: answers.name,
			verifiedAt: new Date().toISOString(),
			verifiedBy: answers.verifiedBy,
			description: answers.description,
			tags,
			featured: answers.featured,
			category: answers.category,
			source: answers.source,
		};

		// Preview
		p.log.step('Plugin entry:');
		console.log(`  ${pc.dim('name:')}        ${pc.cyan(entry.name)}`);
		console.log(`  ${pc.dim('description:')} ${entry.description}`);
		console.log(`  ${pc.dim('tags:')}        ${tags.join(', ') || pc.dim('(none)')}`);
		console.log(`  ${pc.dim('category:')}    ${entry.category}`);
		console.log(`  ${pc.dim('source:')}      ${entry.source}`);
		console.log(`  ${pc.dim('featured:')}    ${entry.featured ? 'yes' : 'no'}`);
		console.log(`  ${pc.dim('verifiedBy:')}  ${entry.verifiedBy}`);

		const confirmed = await p.confirm({
			message: 'Add this plugin?',
			initialValue: true,
		});

		if (p.isCancel(confirmed) || !confirmed) {
			p.cancel('Add cancelled.');
			throw new Error('cancelled');
		}

		let content = readRegistryRaw();
		content = modifyRegistry(content, ['plugins', registry.plugins.length], entry);
		content = modifyRegistry(content, ['lastUpdated'], new Date().toISOString());
		content = modifyRegistry(content, ['version'], '2.0.0');
		writeRegistryRaw(content);

		autoSign();

		p.outro(pc.green(`${pc.bold(entry.name)} added to registry`));
	},
};
