import { describe, expect, test } from 'bun:test';
import { PluginPackageSchema } from '../plugin';

const validManifest = {
  name: '@brika/plugin-weather',
  version: '1.0.0',
  main: './src/index.ts',
  engines: { brika: '^1.0.0' },
};

describe('PluginPackageSchema — grants', () => {
  test('parses a manifest with the `grants` map', () => {
    const result = PluginPackageSchema.safeParse({
      ...validManifest,
      grants: {
        'dev.brika.net.fetch': { allow: ['api.example.com'] },
      },
    });
    expect(result.success).toBe(true);
  });

  test('parses a manifest with an empty `grants` map', () => {
    const result = PluginPackageSchema.safeParse({
      ...validManifest,
      grants: {},
    });
    expect(result.success).toBe(true);
  });

  test('parses a manifest with no grants field', () => {
    // grants is optional — a plugin that requests nothing is valid.
    const result = PluginPackageSchema.safeParse(validManifest);
    expect(result.success).toBe(true);
  });
});
