import { canonicalize, verifyWithRawKey } from '@brika/registry';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { getKeysDir } from '../../crypto';
import { readRegistry, signAndWriteRegistry } from '../../registry-io';
import { extractPluginSignablePayload, extractRegistrySignablePayload } from '../../schema';
import type { Command } from '../index';
import { resolvePublicKey } from '../utils';

export const sign: Command = {
  name: 'sign',
  description: 'Re-sign all plugins and the registry, then verify',
  run() {
    p.intro(pc.bgCyan(pc.black(' registry-cli — sign ')));

    const registry = readRegistry();
    p.log.info(`Loaded ${pc.bold(String(registry.plugins.length))} plugins`);

    const spinner = p.spinner();
    spinner.start('Signing registry…');
    const signed = signAndWriteRegistry();

    if (!signed) {
      spinner.stop(pc.red('Signing failed'));
      p.log.error(`No keys found. Check ${getKeysDir()} or BRIKA_REGISTRY_PRIVATE_KEY env`);
      process.exit(1);
      return;
    }

    spinner.stop('Registry signed');

    // Verify all signatures immediately after signing
    const updated = readRegistry();
    const pubKey = resolvePublicKey(updated);
    let allValid = true;

    p.log.step('Verifying signatures:');

    for (const plugin of updated.plugins) {
      if (!plugin.signature) {
        console.log(`  ${pc.red('✗')} ${pc.bold(plugin.name)} — unsigned`);
        allValid = false;
        continue;
      }
      const payload = extractPluginSignablePayload(plugin);
      const valid = verifyWithRawKey(canonicalize(payload), plugin.signature, pubKey);
      if (valid) {
        console.log(`  ${pc.green('✓')} ${pc.bold(plugin.name)}`);
      } else {
        console.log(`  ${pc.red('✗')} ${pc.bold(plugin.name)} — signature mismatch`);
        allValid = false;
      }
    }

    const regPayload = extractRegistrySignablePayload(updated);
    const regValid =
      !!updated.signature && verifyWithRawKey(canonicalize(regPayload), updated.signature, pubKey);

    if (regValid) {
      p.log.success('Registry signature: valid');
    } else {
      p.log.error('Registry signature: INVALID');
      allValid = false;
    }

    if (!allValid) {
      p.outro(pc.red('Signing completed with errors'));
      process.exit(1);
      return;
    }

    p.outro(pc.green(`All signatures valid (${updated.plugins.length} plugins)`));
  },
};
