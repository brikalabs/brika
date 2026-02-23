/**
 * Ed25519 key management and signing for the registry CLI.
 *
 * Key storage:
 *   Private key: BRIKA_REGISTRY_PRIVATE_KEY env var → ~/.brika/keys/registry.key
 *   Public key:  ~/.brika/keys/registry.pub (also embedded in registry JSON)
 *
 * Verification lives in @brika/registry (canonicalize, verifyWithRawKey).
 */
import { createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SPKI_HEADER } from '@brika/registry';

const KEYS_DIR = join(homedir(), '.brika', 'keys');
const PRIVATE_KEY_PATH = join(KEYS_DIR, 'registry.key');
const PUBLIC_KEY_PATH = join(KEYS_DIR, 'registry.pub');

export interface KeyPair {
	privateKeyPem: string;
	publicKeyPem: string;
	publicKeyBase64: string;
}

/** Generate a new Ed25519 key pair. */
export function generateKeys(): KeyPair {
	const { privateKey, publicKey } = generateKeyPairSync('ed25519');
	const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
	const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
	const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });
	const publicKeyBase64 = Buffer.from(publicKeyDer.subarray(SPKI_HEADER.length)).toString('base64');
	return { privateKeyPem, publicKeyPem, publicKeyBase64 };
}

/** Save a key pair to ~/.brika/keys/. */
export function saveKeys(keys: KeyPair): void {
	if (!existsSync(KEYS_DIR)) {
		mkdirSync(KEYS_DIR, { recursive: true });
	}
	writeFileSync(PRIVATE_KEY_PATH, keys.privateKeyPem, { mode: 0o600 });
	writeFileSync(PUBLIC_KEY_PATH, keys.publicKeyPem, { mode: 0o644 });
}

/** Check whether a key pair exists (env var or disk). */
export function keysExist(): boolean {
	if (process.env.BRIKA_REGISTRY_PRIVATE_KEY) return true;
	return existsSync(PRIVATE_KEY_PATH) && existsSync(PUBLIC_KEY_PATH);
}

/** Check whether keys exist on disk specifically. */
export function keysExistOnDisk(): boolean {
	return existsSync(PRIVATE_KEY_PATH) && existsSync(PUBLIC_KEY_PATH);
}

/** Load the private key PEM (env var → disk). */
export function loadPrivateKey(): string | null {
	const envKey = process.env.BRIKA_REGISTRY_PRIVATE_KEY;
	if (envKey) return envKey;
	if (!existsSync(PRIVATE_KEY_PATH)) return null;
	return readFileSync(PRIVATE_KEY_PATH, 'utf-8');
}

/** Load the public key PEM from disk. */
export function loadPublicKeyPem(): string | null {
	if (!existsSync(PUBLIC_KEY_PATH)) return null;
	return readFileSync(PUBLIC_KEY_PATH, 'utf-8');
}

/** Get the path where keys are stored. */
export function getKeysDir(): string {
	return KEYS_DIR;
}

/** Extract the raw 32-byte public key as base64 from a PEM. */
export function publicKeyToBase64(pem: string): string {
	const key = createPublicKey(pem);
	const der = key.export({ type: 'spki', format: 'der' });
	return Buffer.from(der.subarray(SPKI_HEADER.length)).toString('base64');
}

/** Sign UTF-8 data with an Ed25519 private key. Returns hex-encoded signature. */
export function signData(data: string, privateKeyPem: string): string {
	const sig = sign(null, Buffer.from(data, 'utf-8'), privateKeyPem);
	return sig.toString('hex');
}
