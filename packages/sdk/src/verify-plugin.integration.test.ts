import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { isRecord, readDependencyVersion, verifyPlugin } from './verify-plugin';

// SDK version read from its own package.json — keep in sync
const SDK_VERSION = (
  (await Bun.file(join(import.meta.dir, '..', 'package.json')).json()) as {
    version: string;
  }
).version;

// ─── verifyPlugin (core) ──────────────────────────────────────────────────────

describe('verifyPlugin', () => {
  let tmpDir: string;

  async function setup(
    pkg: Record<string, unknown>,
    files: Record<string, string> = {},
    createMainFile = true
  ): Promise<string> {
    tmpDir = await mkdtemp(join(tmpdir(), 'brika-vp-'));
    const packageJson = {
      main: './src/index.ts',
      ...pkg,
    };
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify(packageJson));
    const mainPath = typeof packageJson.main === 'string' ? packageJson.main : undefined;
    if (createMainFile && mainPath) {
      const mainFilePath = join(tmpDir, mainPath);
      await mkdir(dirname(mainFilePath), { recursive: true });
      await writeFile(mainFilePath, 'export {};');
    }
    for (const [relativePath, content] of Object.entries(files)) {
      const fullPath = join(tmpDir, relativePath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content);
    }
    return tmpDir;
  }

  async function cleanup() {
    await rm(tmpDir, { recursive: true, force: true });
  }

  test('passes for a valid plugin', async () => {
    const dir = await setup(
      {
        name: 'my-plugin',
        version: '1.0.0',
        engines: { brika: `^${SDK_VERSION}` },
        $schema: 'https://schema.brika.dev/plugin.schema.json',
        keywords: ['brika', 'brika-plugin'],
        icon: './icon.svg',
        files: ['src', 'icon.svg'],
      },
      { 'icon.svg': '<svg></svg>' }
    );
    try {
      const result = await verifyPlugin(dir, SDK_VERSION);
      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.name).toBe('my-plugin');
      expect(result.version).toBe('1.0.0');
      expect(result.enginesBrika).toBe(`^${SDK_VERSION}`);
      expect(result.schemaUrl).toBe('https://schema.brika.dev/plugin.schema.json');
    } finally {
      await cleanup();
    }
  });

  test('warns when icon field is missing', async () => {
    const dir = await setup({
      name: 'my-plugin',
      version: '1.0.0',
      engines: { brika: `^${SDK_VERSION}` },
      $schema: 'https://schema.brika.dev/plugin.schema.json',
      keywords: ['brika', 'brika-plugin'],
    });
    try {
      const result = await verifyPlugin(dir, SDK_VERSION);
      expect(result.passed).toBe(true);
      expect(result.warnings.some((w) => w.includes('icon is missing'))).toBe(true);
    } finally {
      await cleanup();
    }
  });

  test('errors when engines.brika is missing', async () => {
    const dir = await setup({
      name: 'p',
      version: '1.0.0',
      engines: {},
      $schema: 'https://schema.brika.dev/plugin.schema.json',
    });
    try {
      const result = await verifyPlugin(dir, SDK_VERSION);
      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.includes('engines.brika'))).toBe(true);
    } finally {
      await cleanup();
    }
  });

  test('errors when engines.brika range does not cover SDK version', async () => {
    const dir = await setup({
      name: 'p',
      version: '1.0.0',
      engines: { brika: '^0.0.1' },
      $schema: 'https://schema.brika.dev/plugin.schema.json',
    });
    try {
      const result = await verifyPlugin(dir, SDK_VERSION);
      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.includes('does not cover current SDK version'))).toBe(
        true
      );
    } finally {
      await cleanup();
    }
  });

  test('errors when main path does not exist', async () => {
    const dir = await setup(
      {
        name: 'p',
        version: '1.0.0',
        main: './src/missing.ts',
        engines: { brika: `^${SDK_VERSION}` },
      },
      {},
      false
    );
    try {
      const result = await verifyPlugin(dir, SDK_VERSION);
      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.includes('main path "./src/missing.ts"'))).toBe(true);
    } finally {
      await cleanup();
    }
  });

  test('warns when $schema is missing', async () => {
    const dir = await setup({
      name: 'p',
      version: '1.0.0',
      engines: { brika: `^${SDK_VERSION}` },
      keywords: ['brika', 'brika-plugin'],
    });
    try {
      const result = await verifyPlugin(dir, SDK_VERSION);
      expect(result.passed).toBe(true);
      expect(result.warnings.some((w) => w.includes('$schema field is missing'))).toBe(true);
    } finally {
      await cleanup();
    }
  });

  test('warns when $schema points to wrong host', async () => {
    const dir = await setup({
      name: 'p',
      version: '1.0.0',
      engines: { brika: `^${SDK_VERSION}` },
      $schema: 'https://json.schemastore.org/package',
      keywords: ['brika', 'brika-plugin'],
    });
    try {
      const result = await verifyPlugin(dir, SDK_VERSION);
      expect(result.passed).toBe(true);
      expect(result.warnings.some((w) => w.includes('does not point to schema.brika.dev'))).toBe(
        true
      );
    } finally {
      await cleanup();
    }
  });

  test('reports schema validation errors', async () => {
    const dir = await setup({
      version: '1.0.0',
      engines: { brika: `^${SDK_VERSION}` },
    });
    try {
      const result = await verifyPlugin(dir, SDK_VERSION);
      expect(result.errors.some((e) => e.startsWith('Schema:'))).toBe(true);
    } finally {
      await cleanup();
    }
  });

  test('warns when declared icon is missing on disk', async () => {
    const dir = await setup(
      {
        name: 'my-plugin',
        version: '1.0.0',
        engines: { brika: `^${SDK_VERSION}` },
        $schema: 'https://schema.brika.dev/plugin.schema.json',
        keywords: ['brika', 'brika-plugin'],
        icon: './icon.svg',
        files: ['src', 'README.md'],
      },
      { 'src/index.ts': 'export {};', 'README.md': '# Plugin' }
    );
    try {
      const result = await verifyPlugin(dir, SDK_VERSION);
      expect(result.passed).toBe(true);
      expect(result.warnings.some((w) => w.includes('declared but missing on disk'))).toBe(true);
    } finally {
      await cleanup();
    }
  });

  test('warns when files misses expected plugin paths', async () => {
    const dir = await setup(
      {
        name: 'my-plugin',
        version: '1.0.0',
        engines: { brika: `^${SDK_VERSION}` },
        $schema: 'https://schema.brika.dev/plugin.schema.json',
        keywords: ['brika', 'brika-plugin'],
        icon: './icon.svg',
        files: ['src'],
      },
      {
        'src/index.ts': 'export {};',
        'locales/en.json': '{}',
        'icon.svg': '<svg></svg>',
        'README.md': '# Plugin',
      }
    );
    try {
      const result = await verifyPlugin(dir, SDK_VERSION);
      expect(result.passed).toBe(true);
      expect(result.warnings.some((w) => w.includes('files should include publish paths'))).toBe(
        true
      );
    } finally {
      await cleanup();
    }
  });

  test('throws when package.json does not exist', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'brika-vp-empty-'));
    try {
      let threw = false;
      try {
        await verifyPlugin(tmpDir, SDK_VERSION);
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    } finally {
      await cleanup();
    }
  });
});

// ─── isRecord ─────────────────────────────────────────────────────────────────

describe('isRecord', () => {
  test('returns true for plain objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1, b: 'two' })).toBe(true);
  });

  test('returns true for arrays (arrays are objects)', () => {
    expect(isRecord([])).toBe(true);
    expect(isRecord([1, 2, 3])).toBe(true);
  });

  test('returns false for null', () => {
    expect(isRecord(null)).toBe(false);
  });

  test('returns false for undefined', () => {
    expect(isRecord(undefined)).toBe(false);
  });

  test('returns false for primitives', () => {
    expect(isRecord(42)).toBe(false);
    expect(isRecord('string')).toBe(false);
    expect(isRecord(true)).toBe(false);
    expect(isRecord(0)).toBe(false);
    expect(isRecord('')).toBe(false);
  });
});

// ─── readDependencyVersion ────────────────────────────────────────────────────

describe('readDependencyVersion', () => {
  test('returns version from dependencies', () => {
    expect(readDependencyVersion({ dependencies: { '@brika/sdk': '^1.0.0' } }, '@brika/sdk')).toBe(
      '^1.0.0'
    );
  });

  test('returns version from peerDependencies', () => {
    expect(
      readDependencyVersion({ peerDependencies: { '@brika/sdk': '>=0.3.0' } }, '@brika/sdk')
    ).toBe('>=0.3.0');
  });

  test('returns version from devDependencies', () => {
    expect(
      readDependencyVersion({ devDependencies: { '@brika/sdk': 'workspace:*' } }, '@brika/sdk')
    ).toBe('workspace:*');
  });

  test('prefers dependencies over peerDependencies', () => {
    expect(
      readDependencyVersion(
        { dependencies: { '@brika/sdk': '^1.0.0' }, peerDependencies: { '@brika/sdk': '^2.0.0' } },
        '@brika/sdk'
      )
    ).toBe('^1.0.0');
  });

  test('prefers peerDependencies over devDependencies', () => {
    expect(
      readDependencyVersion(
        {
          peerDependencies: { '@brika/sdk': '^2.0.0' },
          devDependencies: { '@brika/sdk': '^3.0.0' },
        },
        '@brika/sdk'
      )
    ).toBe('^2.0.0');
  });

  test('returns null when package is not found in any dependency map', () => {
    expect(
      readDependencyVersion(
        { dependencies: { lodash: '^4.0.0' }, peerDependencies: { react: '^18.0.0' } },
        '@brika/sdk'
      )
    ).toBeNull();
  });

  test('returns null when no dependency fields exist', () => {
    expect(
      readDependencyVersion({ name: 'my-package', version: '1.0.0' }, '@brika/sdk')
    ).toBeNull();
  });

  test('returns null for non-object input', () => {
    expect(readDependencyVersion(null, '@brika/sdk')).toBeNull();
    expect(readDependencyVersion(undefined, '@brika/sdk')).toBeNull();
    expect(readDependencyVersion('string', '@brika/sdk')).toBeNull();
    expect(readDependencyVersion(42, '@brika/sdk')).toBeNull();
  });

  test('skips non-string version values', () => {
    expect(
      readDependencyVersion(
        {
          dependencies: { '@brika/sdk': 123 },
          peerDependencies: { '@brika/sdk': true },
          devDependencies: { '@brika/sdk': '^1.0.0' },
        },
        '@brika/sdk'
      )
    ).toBe('^1.0.0');
  });

  test('skips non-object dependency maps', () => {
    expect(
      readDependencyVersion(
        {
          dependencies: 'not-an-object',
          peerDependencies: null,
          devDependencies: { '@brika/sdk': '^1.0.0' },
        },
        '@brika/sdk'
      )
    ).toBe('^1.0.0');
  });
});
