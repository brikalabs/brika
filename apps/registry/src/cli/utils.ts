/**
 * Shared CLI utilities for registry commands.
 */
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { REGISTRY_PUBLIC_KEY, verifyWithRawKey } from '@brika/registry';
import { keysExist, loadPublicKeyPem, publicKeyToBase64 } from '../crypto';
import { signAndWriteRegistry } from '../registry-io';
import type { VerifiedPluginsList } from '../schema';

/**
 * Auto-sign the registry after a mutation (add/remove/edit).
 * Shows a spinner while signing and warns if no keys are available.
 */
export function autoSign(): void {
	if (!keysExist()) {
		p.log.warn('No keys found — changes saved unsigned. Run `keygen` to generate keys.');
		return;
	}

	const spinner = p.spinner();
	spinner.start('Signing registry…');
	const signed = signAndWriteRegistry();
	spinner.stop(signed ? pc.green('Registry signed') : pc.yellow('Signing failed (check keys)'));
}

/**
 * Resolve the public key for verification.
 * Priority: local key file → registry JSON → shared constant.
 */
export function resolvePublicKey(registry: VerifiedPluginsList): string {
	const pem = loadPublicKeyPem();
	if (pem) return publicKeyToBase64(pem);
	return registry.publicKey ?? REGISTRY_PUBLIC_KEY;
}

/**
 * Verify a single plugin's signature against the resolved public key.
 */
export function verifyPluginSignature(
	canonicalPayload: string,
	signatureHex: string,
	publicKeyBase64: string,
): boolean {
	return verifyWithRawKey(canonicalPayload, signatureHex, publicKeyBase64);
}

/** Parse a comma-separated tag string into a clean array. */
export function parseTags(input: string): string[] {
	return input.split(',').map((t) => t.trim()).filter(Boolean);
}
