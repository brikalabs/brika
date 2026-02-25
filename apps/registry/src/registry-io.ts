/**
 * Registry I/O — read/write verified-plugins.json with format preservation.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalize } from '@brika/registry';
import { applyEdits, modify } from 'jsonc-parser';
import {
  derivePublicKeyPem,
  loadPrivateKey,
  loadPublicKeyPem,
  publicKeyToBase64,
  signData,
} from './crypto';
import {
  extractPluginSignablePayload,
  extractRegistrySignablePayload,
  type VerifiedPluginsList,
  VerifiedPluginsListSchema,
} from './schema';

const REGISTRY_PATH = join(import.meta.dir, '../verified-plugins.json');

/** Read and parse the registry file, validating against the Zod schema. */
export function readRegistry(): VerifiedPluginsList {
  const raw = readFileSync(REGISTRY_PATH, 'utf-8');
  return VerifiedPluginsListSchema.parse(JSON.parse(raw));
}

/** Read the registry file as raw text (for format-preserving edits). */
export function readRegistryRaw(): string {
  return readFileSync(REGISTRY_PATH, 'utf-8');
}

/** Write raw text to the registry file. */
export function writeRegistryRaw(content: string): void {
  writeFileSync(REGISTRY_PATH, content, 'utf-8');
}

/** Apply a format-preserving JSON modification. Returns the updated text. */
export function modifyRegistry(
  content: string,
  path: Array<string | number>,
  value: unknown
): string {
  const edits = modify(content, path, value, {
    formattingOptions: { insertSpaces: true, tabSize: 2 },
  });
  return applyEdits(content, edits);
}

/**
 * Sign a registry file at the given path using the provided PEM keys.
 * Re-signs every plugin entry and then the registry as a whole.
 */
export function signRegistryAtPath(
  registryPath: string,
  privateKeyPem: string,
  publicKeyPem: string
): void {
  const registry = VerifiedPluginsListSchema.parse(JSON.parse(readFileSync(registryPath, 'utf-8')));
  const publicKeyBase64 = publicKeyToBase64(publicKeyPem);

  let content = readFileSync(registryPath, 'utf-8');

  // Update metadata
  content = modifyRegistry(content, ['lastUpdated'], new Date().toISOString());
  content = modifyRegistry(content, ['publicKey'], publicKeyBase64);

  // Sign each plugin entry
  for (let i = 0; i < registry.plugins.length; i++) {
    const payload = extractPluginSignablePayload(registry.plugins[i]);
    const sig = signData(canonicalize(payload), privateKeyPem);
    content = modifyRegistry(content, ['plugins', i, 'signature'], sig);
  }

  // Sign registry (re-parse to include updated plugin signatures)
  const updatedRegistry = VerifiedPluginsListSchema.parse(JSON.parse(content));
  const regPayload = extractRegistrySignablePayload(updatedRegistry);
  const regSig = signData(canonicalize(regPayload), privateKeyPem);
  content = modifyRegistry(content, ['signature'], regSig);

  writeFileSync(registryPath, content, 'utf-8');
}

/**
 * Sign the registry and write it to disk with format preservation.
 * Returns true if signed, false if no keys found.
 */
export function signAndWriteRegistry(): boolean {
  const privateKeyPem = loadPrivateKey();
  if (!privateKeyPem) return false;

  const publicKeyPem = loadPublicKeyPem() ?? derivePublicKeyPem(privateKeyPem);

  signRegistryAtPath(REGISTRY_PATH, privateKeyPem, publicKeyPem);
  return true;
}

export { REGISTRY_PATH };
