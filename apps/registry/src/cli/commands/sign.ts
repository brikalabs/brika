import * as p from '@clack/prompts';
import pc from 'picocolors';
import { getKeysDir } from '../../crypto';
import { readRegistry, signAndWriteRegistry } from '../../registry-io';
import type { Command } from '../index';

export const sign: Command = {
  name: 'sign',
  description: 'Re-sign the entire registry manually',
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

    // Show per-plugin signatures
    const updated = readRegistry();
    for (const plugin of updated.plugins) {
      if (plugin.signature) {
        const trunc = plugin.signature.slice(0, 16) + '…' + plugin.signature.slice(-8);
        p.log.success(`${pc.bold(plugin.name)}  ${pc.dim(trunc)}`);
      }
    }

    p.outro(pc.green(`Registry signed (${updated.plugins.length} plugins)`));
  },
};
