import { describe, expect, test } from 'bun:test';
import { PluginPackageSchema } from '../plugin';

const validManifest = {
  name: '@brika/plugin-weather',
  version: '1.0.0',
  main: './src/index.ts',
  engines: { brika: '^1.0.0' },
};

describe('PluginPackageSchema — legacy permissions migration', () => {
  test('parses a manifest with the new `capabilities` map', () => {
    const result = PluginPackageSchema.safeParse({
      ...validManifest,
      capabilities: {
        'dev.brika.net.fetch': { allow: ['api.example.com'] },
      },
    });
    expect(result.success).toBe(true);
  });

  test('rejects a manifest carrying the legacy `permissions: string[]` field', () => {
    const result = PluginPackageSchema.safeParse({
      ...validManifest,
      permissions: ['net'],
    });
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    const issue = result.error.issues.find((i) => i.path[0] === 'permissions');
    expect(issue).toBeDefined();
    expect(issue?.message).toContain("'permissions' field has been replaced by 'capabilities'");
    expect(issue?.message).toContain('https://docs.brika.dev');
  });

  test('rejects a manifest carrying `permissions` even when `capabilities` is also set', () => {
    const result = PluginPackageSchema.safeParse({
      ...validManifest,
      capabilities: { 'dev.brika.net.fetch': {} },
      permissions: ['net'],
    });
    expect(result.success).toBe(false);
  });
});
