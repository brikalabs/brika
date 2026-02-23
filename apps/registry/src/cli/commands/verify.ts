import * as p from '@clack/prompts';
import pc from 'picocolors';
import { canonicalize, verifyWithRawKey } from '@brika/registry';
import type { Command } from '../index';
import { resolvePublicKey } from '../utils';
import { readRegistry } from '../../registry-io';
import { extractPluginSignablePayload, extractRegistrySignablePayload } from '../../schema';

function verifyRegistrySignature(
	registry: ReturnType<typeof readRegistry>,
	pubKeyBase64: string,
): boolean {
	if (!registry.signature) {
		p.log.warn('Registry has no signature');
		return false;
	}

	const payload = extractRegistrySignablePayload(registry);
	const valid = verifyWithRawKey(canonicalize(payload), registry.signature, pubKeyBase64);

	if (valid) {
		p.log.success(`Registry signature: ${pc.green('valid')}`);
	} else {
		p.log.error(`Registry signature: ${pc.red('INVALID')}`);
	}

	return valid;
}

function verifyPluginSignature(
	plugin: ReturnType<typeof readRegistry>['plugins'][number],
	pubKeyBase64: string,
): boolean {
	if (!plugin.signature) {
		console.log(`  ${pc.red('x')} ${pc.bold(plugin.name)} — ${pc.red('unsigned')}`);
		return false;
	}

	const payload = extractPluginSignablePayload(plugin);
	const valid = verifyWithRawKey(canonicalize(payload), plugin.signature, pubKeyBase64);

	const icon = valid ? pc.green('o') : pc.red('x');
	const suffix = valid ? '' : ` — ${pc.red('signature mismatch')}`;
	console.log(`  ${icon} ${pc.bold(plugin.name)}${suffix}`);

	return valid;
}

export const verify: Command = {
	name: 'verify',
	description: 'Verify all signatures in the registry',
	async run() {
		p.intro(pc.bgCyan(pc.black(' registry-cli — verify ')));

		const registry = readRegistry();
		const pubKeyBase64 = resolvePublicKey(registry);
		let hasErrors = !verifyRegistrySignature(registry, pubKeyBase64);

		if (registry.plugins.length === 0) {
			p.log.info('No plugins to verify.');
		} else {
			p.log.step('Plugin signatures:');
			for (const plugin of registry.plugins) {
				if (!verifyPluginSignature(plugin, pubKeyBase64)) {
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
