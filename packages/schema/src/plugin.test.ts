import { describe, expect, test } from 'bun:test';
import { PluginPackageSchema } from './plugin';

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

describe('PluginPackageSchema — actions', () => {
  test('parses a manifest with a generated actions array', () => {
    const result = PluginPackageSchema.safeParse({
      ...validManifest,
      actions: [
        { id: '0844025241d0', file: 'src/actions.ts', name: 'listDevices' },
        { id: 'e73eb4f0eb95', file: 'src/pages/files/actions.ts', name: 'default' },
      ],
    });
    expect(result.success).toBe(true);
  });

  test('parses a manifest with no actions field (optional)', () => {
    const result = PluginPackageSchema.safeParse(validManifest);
    expect(result.success).toBe(true);
  });

  test('rejects an action id that is not the 12-hex build hash', () => {
    for (const id of ['do-stuff', '0844', '0844025241D0', '0844025241d0ff']) {
      const result = PluginPackageSchema.safeParse({
        ...validManifest,
        actions: [{ id, file: 'src/actions.ts', name: 'x' }],
      });
      expect(result.success).toBe(false);
    }
  });

  test('rejects an action entry missing file or name', () => {
    const result = PluginPackageSchema.safeParse({
      ...validManifest,
      actions: [{ id: '0844025241d0' }],
    });
    expect(result.success).toBe(false);
  });
});

function parseResources(fs: Record<string, unknown>) {
  return PluginPackageSchema.safeParse({ ...validManifest, resources: { fs } });
}

describe('PluginPackageSchema — resources.fs byte sizes', () => {
  test('accepts raw integers and keeps them as-is', () => {
    const result = parseResources({ maxFileBytes: 536_870_912 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resources?.fs?.maxFileBytes).toBe(536_870_912);
    }
  });

  test('parses common unit suffixes to base-1024 integers', () => {
    const samples: Array<[string, number]> = [
      ['1024', 1024],
      ['1k', 1024],
      ['1kb', 1024],
      ['1KiB', 1024],
      ['1mb', 1024 ** 2],
      ['1 MiB', 1024 ** 2],
      ['1gb', 1024 ** 3],
      ['2 GB', 2 * 1024 ** 3],
      ['1.5gb', Math.floor(1.5 * 1024 ** 3)],
      ['512 mib', 512 * 1024 ** 2],
    ];
    for (const [input, expected] of samples) {
      const result = parseResources({ maxFileBytes: input });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.resources?.fs?.maxFileBytes).toBe(expected);
      }
    }
  });

  test('mixes numeric and string quota values in the same block', () => {
    const result = parseResources({
      maxFileBytes: '512mb',
      quotas: { data: '2gb', cache: 1_073_741_824, tmp: '256 mib' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resources?.fs?.maxFileBytes).toBe(512 * 1024 ** 2);
      expect(result.data.resources?.fs?.quotas?.data).toBe(2 * 1024 ** 3);
      expect(result.data.resources?.fs?.quotas?.cache).toBe(1_073_741_824);
      expect(result.data.resources?.fs?.quotas?.tmp).toBe(256 * 1024 ** 2);
    }
  });

  test('rejects malformed strings, zero, and unknown units', () => {
    const badInputs = ['', 'gb', '1xb', '-1mb', '0', '0kb', '1.2.3mb', 'abc'];
    for (const input of badInputs) {
      const result = parseResources({ maxFileBytes: input });
      expect(result.success).toBe(false);
    }
  });

  test('rejects byte strings exceeding the 32-char length cap (ReDoS hatch)', () => {
    // Pad with the only character that's allowed unbounded by the
    // regex (`\s`) to confirm the length check fires before the
    // regex engine runs.
    const tooLong = `${' '.repeat(40)}1gb`;
    const result = parseResources({ maxFileBytes: tooLong });
    expect(result.success).toBe(false);
  });
});
