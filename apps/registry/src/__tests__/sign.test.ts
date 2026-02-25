import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalize, verifyWithRawKey } from '@brika/registry';
import { generateKeys } from '../crypto';
import { signRegistryAtPath } from '../registry-io';
import {
  extractPluginSignablePayload,
  extractRegistrySignablePayload,
  VerifiedPluginsListSchema,
} from '../schema';

// Minimal registry fixture — mirrors a real verified-plugins.json
const REGISTRY_FIXTURE = JSON.stringify({
  $schema: './schema.json',
  version: '2.0.0',
  lastUpdated: '2026-01-01T00:00:00.000Z',
  plugins: [
    {
      name: '@brika/plugin-a',
      verifiedAt: '2026-01-01T00:00:00Z',
      verifiedBy: 'maintainer',
      description: 'Plugin A',
      tags: ['a'],
      featured: false,
      category: 'community',
      source: 'npm',
    },
    {
      name: '@brika/plugin-b',
      verifiedAt: '2026-01-02T00:00:00Z',
      verifiedBy: 'maintainer',
      description: 'Plugin B',
      tags: ['b'],
      featured: true,
      category: 'official',
      source: 'npm',
    },
  ],
});

let tmpDir: string;
let registryPath: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `brika-sign-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  registryPath = join(tmpDir, 'verified-plugins.json');
  writeFileSync(registryPath, REGISTRY_FIXTURE, 'utf-8');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('signRegistryAtPath', () => {
  test('signs all plugins and the registry', () => {
    const keys = generateKeys();
    signRegistryAtPath(registryPath, keys.privateKeyPem, keys.publicKeyPem);

    const registry = VerifiedPluginsListSchema.parse(
      JSON.parse(require('node:fs').readFileSync(registryPath, 'utf-8'))
    );

    // Every plugin must have a valid signature
    for (const plugin of registry.plugins) {
      expect(plugin.signature).toBeDefined();
      const payload = extractPluginSignablePayload(plugin);
      expect(verifyWithRawKey(canonicalize(payload), plugin.signature!, keys.publicKeyBase64)).toBe(
        true
      );
    }

    // Registry-level signature must be valid
    expect(registry.signature).toBeDefined();
    const regPayload = extractRegistrySignablePayload(registry);
    expect(
      verifyWithRawKey(canonicalize(regPayload), registry.signature!, keys.publicKeyBase64)
    ).toBe(true);
  });

  test('writes the public key into the registry', () => {
    const keys = generateKeys();
    signRegistryAtPath(registryPath, keys.privateKeyPem, keys.publicKeyPem);

    const registry = VerifiedPluginsListSchema.parse(
      JSON.parse(require('node:fs').readFileSync(registryPath, 'utf-8'))
    );

    expect(registry.publicKey).toBe(keys.publicKeyBase64);
  });

  test('re-signs a registry that already has stale signatures (the manual-edit scenario)', () => {
    const oldKeys = generateKeys();
    // Sign once with old keys
    signRegistryAtPath(registryPath, oldKeys.privateKeyPem, oldKeys.publicKeyPem);

    // Simulate: two plugins added manually (no individual signatures), registry sig now stale
    const stale = JSON.parse(require('node:fs').readFileSync(registryPath, 'utf-8'));
    stale.plugins.push({
      name: '@brika/plugin-c',
      verifiedAt: '2026-02-01T00:00:00Z',
      verifiedBy: 'maintainer',
      description: 'Plugin C added manually',
      tags: [],
      featured: false,
      category: 'community',
      source: 'npm',
    });
    writeFileSync(registryPath, JSON.stringify(stale, null, 2), 'utf-8');

    // Re-sign with same keys
    signRegistryAtPath(registryPath, oldKeys.privateKeyPem, oldKeys.publicKeyPem);

    const registry = VerifiedPluginsListSchema.parse(
      JSON.parse(require('node:fs').readFileSync(registryPath, 'utf-8'))
    );

    expect(registry.plugins).toHaveLength(3);

    for (const plugin of registry.plugins) {
      expect(plugin.signature).toBeDefined();
      const payload = extractPluginSignablePayload(plugin);
      expect(
        verifyWithRawKey(canonicalize(payload), plugin.signature!, oldKeys.publicKeyBase64)
      ).toBe(true);
    }

    expect(registry.signature).toBeDefined();
    const regPayload = extractRegistrySignablePayload(registry);
    expect(
      verifyWithRawKey(canonicalize(regPayload), registry.signature!, oldKeys.publicKeyBase64)
    ).toBe(true);
  });

  test('old registry signature is invalid after manually adding a plugin (reproduces the bug)', () => {
    const keys = generateKeys();
    // Sign with one plugin
    signRegistryAtPath(registryPath, keys.privateKeyPem, keys.publicKeyPem);

    const signed = VerifiedPluginsListSchema.parse(
      JSON.parse(require('node:fs').readFileSync(registryPath, 'utf-8'))
    );

    // Verify it's valid before tampering
    const regPayload = extractRegistrySignablePayload(signed);
    expect(
      verifyWithRawKey(canonicalize(regPayload), signed.signature!, keys.publicKeyBase64)
    ).toBe(true);

    // Manually add a plugin without re-signing
    const stale = JSON.parse(require('node:fs').readFileSync(registryPath, 'utf-8'));
    stale.plugins.push({
      name: '@brika/plugin-new',
      verifiedAt: '2026-03-01T00:00:00Z',
      verifiedBy: 'maintainer',
      description: 'New plugin',
      tags: [],
      featured: false,
      category: 'community',
      source: 'npm',
    });
    writeFileSync(registryPath, JSON.stringify(stale, null, 2), 'utf-8');

    const tampered = VerifiedPluginsListSchema.parse(
      JSON.parse(require('node:fs').readFileSync(registryPath, 'utf-8'))
    );

    // Registry signature is now invalid (covers old plugin list)
    const tamperedPayload = extractRegistrySignablePayload(tampered);
    expect(
      verifyWithRawKey(canonicalize(tamperedPayload), tampered.signature!, keys.publicKeyBase64)
    ).toBe(false);
  });
});
