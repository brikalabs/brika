import * as p from '@clack/prompts';
import pc from 'picocolors';
import { canonicalize, verifyWithRawKey } from '@brika/registry';
import type { Command } from '../index';
import { resolvePublicKey } from '../utils';
import { readRegistry } from '../../registry-io';
import { extractPluginSignablePayload, extractRegistrySignablePayload } from '../../schema';

export const verify: Command = {
	name: 'verify',
	description: 'Verify all signatures in the registry',
	async run() {
		p.intro(pc.bgCyan(pc.black(' registry-cli — verify ')));

		const registry = readRegistry();
		const pubKeyBase64 = resolvePublicKey(registry);
		let hasErrors = false;

		// Verify registry-level signature
		if (registry.signature) {
			const payload = extractRegistrySignablePayload(registry);
			const valid = verifyWithRawKey(canonicalize(payload), registry.signature, pubKeyBase64);
			if (valid) {
				p.log.success(`Registry signature: ${pc.green('valid')}`);
			} else {
				p.log.error(`Registry signature: ${pc.red('INVALID')}`);
				hasErrors = true;
			}
		} else {
			p.log.warn('Registry has no signature');
			hasErrors = true;
		}

		// Verify per-plugin signatures
		if (registry.plugins.length === 0) {
			p.log.info('No plugins to verify.');
		} else {
			p.log.step('Plugin signatures:');

			for (const plugin of registry.plugins) {
				if (!plugin.signature) {
					console.log(`  ${pc.red('x')} ${pc.bold(plugin.name)} — ${pc.red('unsigned')}`);
					hasErrors = true;
					continue;
				}

				const payload = extractPluginSignablePayload(plugin);
				const valid = verifyWithRawKey(canonicalize(payload), plugin.signature, pubKeyBase64);

				if (valid) {
					console.log(`  ${pc.green('o')} ${pc.bold(plugin.name)}`);
				} else {
					console.log(`  ${pc.red('x')} ${pc.bold(plugin.name)} — ${pc.red('signature mismatch')}`);
					hasErrors = true;
				}
			}
		}

		console.log();

		if (hasErrors) {
			p.outro(pc.red('Verification failed'));
			process.exit(1);
		}

		p.outro(pc.green('All signatures valid'));
	},
};
