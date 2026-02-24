import * as p from '@clack/prompts';
import pc from 'picocolors';
import {
  generateKeys,
  getKeysDir,
  keysExistOnDisk,
  loadPublicKeyPem,
  publicKeyToBase64,
  saveKeys,
} from '../../crypto';
import type { Command } from '../index';

export const keygen: Command = {
  name: 'keygen',
  description: 'Generate Ed25519 key pair for signing',
  async run() {
    p.intro(pc.bgCyan(pc.black(' registry-cli — keygen ')));

    const keysDir = getKeysDir();

    if (keysExistOnDisk()) {
      // Show what exists so the user knows what they're replacing
      const existingPub = loadPublicKeyPem();
      if (existingPub) {
        const existingBase64 = publicKeyToBase64(existingPub);
        p.log.warn(`A key pair already exists at ${pc.dim(keysDir)}`);
        p.log.info(`Current public key: ${pc.cyan(existingBase64)}`);
      }

      p.log.error(
        pc.red('Generating a new key will INVALIDATE all existing signatures.') +
          '\n' +
          pc.red('Every signed plugin and the registry itself will need to be re-signed.') +
          '\n' +
          pc.red('All hubs with a pinned public key will reject the registry until updated.')
      );

      const overwrite = await p.confirm({
        message: 'Replace the existing key pair? This cannot be undone.',
        initialValue: false,
      });

      if (p.isCancel(overwrite) || !overwrite) {
        p.cancel('Key generation cancelled.');
        throw new Error('cancelled');
      }
    }

    const spinner = p.spinner();
    spinner.start('Generating Ed25519 key pair…');

    const keys = generateKeys();
    saveKeys(keys);

    spinner.stop('Key pair generated');

    p.log.info(`${pc.dim('Location:')}    ${keysDir}`);
    p.log.info(
      `${pc.dim('Private key:')} registry.key ${pc.red('(keep secret — back this up safely)')}`
    );
    p.log.info(`${pc.dim('Public key:')}  registry.pub`);
    p.log.step(`${pc.dim('Base64 raw:')}  ${pc.cyan(keys.publicKeyBase64)}`);

    p.note(
      [
        `${pc.bold('Back up your private key!')} If lost, you must generate a new one`,
        'and re-sign the entire registry + update all pinned keys.',
        '',
        `${pc.bold('For CI/CD:')} Set ${pc.cyan('BRIKA_REGISTRY_PRIVATE_KEY')} env var`,
        'with the PEM content instead of relying on the file.',
      ].join('\n'),
      'Important'
    );

    p.outro(pc.green('Key pair ready. Run `sign` to sign the registry.'));
  },
};
