import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { isRecord, readDependencyVersion, verifyPlugin } from '../verify-plugin';

/** Strip ANSI escape sequences so assertions work regardless of color output. */
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

const VERIFY_SCRIPT = join(import.meta.dir, '..', 'verify.ts');
// SDK version read from its own package.json — keep in sync
const SDK_VERSION = (
  (await Bun.file(join(import.meta.dir, '..', '..', 'package.json')).json()) as { version: string }
).version;

/**
 * Runs the verify script against a temp directory containing the given package.json.
 */
async function runVerify(
  pkg: Record<string, unknown>,
  files: Record<string, string> = {},
  createMainFile = true
): Promise<{ exitCode: number; stdout: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'brika-verify-'));
  try {
    await writeFile(join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
    const mainPath = typeof pkg.main === 'string' ? pkg.main : undefined;
    if (createMainFile && mainPath) {
      const mainFilePath = join(dir, mainPath);
      await mkdir(dirname(mainFilePath), { recursive: true });
      await writeFile(mainFilePath, 'export {};');
    }
    for (const [relativePath, content] of Object.entries(files)) {
      const fullPath = join(dir, relativePath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content);
    }
    const proc = Bun.spawn(['bun', VERIFY_SCRIPT, dir], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const exitCode = await proc.exited;
    const stdout = stripAnsi(await new Response(proc.stdout).text());
    return { exitCode, stdout };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Minimal valid plugin package.json */
function validPlugin(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'my-plugin',
    version: '1.0.0',
    main: './src/index.ts',
    engines: { brika: '^' + SDK_VERSION },
    $schema: 'https://schema.brika.dev/plugin.schema.json',
    keywords: ['brika', 'brika-plugin'],
    ...overrides,
  };
}

describe('brika-verify-plugin', () => {
  describe('valid plugin', () => {
    test('passes with all correct fields', async () => {
      const { exitCode, stdout } = await runVerify(validPlugin());
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Verification passed');
    });

    test('shows schema validation passed', async () => {
      const { stdout } = await runVerify(validPlugin());
      expect(stdout).toContain('schema validation passed');
    });

    test('shows engines.brika check passed', async () => {
      const { stdout } = await runVerify(validPlugin());
      expect(stdout).toContain('engines.brika');
      expect(stdout).toContain(SDK_VERSION);
    });

    test('shows $schema check passed', async () => {
      const { stdout } = await runVerify(validPlugin());
      expect(stdout).toContain('$schema');
      expect(stdout).toContain('schema.brika.dev');
    });
  });

  describe('engines.brika', () => {
    test('fails when engines.brika is missing', async () => {
      const { exitCode, stdout } = await runVerify(validPlugin({ engines: {} }));
      expect(exitCode).toBe(1);
      expect(stdout).toContain('engines.brika');
    });

    test('fails when engines field is absent entirely', async () => {
      const pkg = validPlugin();
      delete pkg.engines;
      const { exitCode, stdout } = await runVerify(pkg);
      expect(exitCode).toBe(1);
      expect(stdout).toContain('engines');
    });

    test('fails when range does not cover current SDK version', async () => {
      const { exitCode, stdout } = await runVerify(validPlugin({ engines: { brika: '^0.1.0' } }));
      expect(exitCode).toBe(1);
      expect(stdout).toContain('does not cover current SDK version');
      expect(stdout).toContain(SDK_VERSION);
    });

    test('passes with >= range covering current version', async () => {
      const { exitCode } = await runVerify(validPlugin({ engines: { brika: '>=' + SDK_VERSION } }));
      expect(exitCode).toBe(0);
    });

    test('passes with exact version match', async () => {
      const { exitCode } = await runVerify(validPlugin({ engines: { brika: SDK_VERSION } }));
      expect(exitCode).toBe(0);
    });
  });

  describe('main entrypoint', () => {
    test('fails when main path does not exist', async () => {
      const { exitCode, stdout } = await runVerify(
        validPlugin({ main: './src/missing.ts' }),
        {},
        false
      );
      expect(exitCode).toBe(1);
      expect(stdout).toContain('main path "./src/missing.ts" is declared but missing on disk');
    });
  });

  describe('keywords', () => {
    test('shows success checks for brika and brika-plugin when both are present', async () => {
      const { stdout } = await runVerify(validPlugin());
      expect(stdout).toContain('keywords include brika');
      expect(stdout).toContain('keywords include brika-plugin');
    });

    test('fails when keywords are missing', async () => {
      const pkg = validPlugin();
      delete pkg.keywords;
      const { exitCode, stdout } = await runVerify(pkg);
      expect(exitCode).toBe(1);
      expect(stdout).toContain('keywords must include "brika"');
    });

    test('fails when keywords do not include brika', async () => {
      const { exitCode, stdout } = await runVerify(validPlugin({ keywords: ['plugin'] }));
      expect(exitCode).toBe(1);
      expect(stdout).toContain('keywords must include "brika"');
    });

    test('shows brika-plugin success even when brika is missing', async () => {
      const { exitCode, stdout } = await runVerify(validPlugin({ keywords: ['brika-plugin'] }));
      expect(exitCode).toBe(1);
      expect(stdout).toContain('keywords include brika-plugin');
      expect(stdout).toContain('keywords must include "brika"');
    });

    test('warns (but passes) when brika-plugin keyword is missing', async () => {
      const { exitCode, stdout } = await runVerify(validPlugin({ keywords: ['brika'] }));
      expect(exitCode).toBe(0);
      expect(stdout).toContain('keywords include brika');
      expect(stdout).not.toContain('keywords include brika-plugin');
      expect(stdout).toContain('keywords should include "brika-plugin"');
      expect(stdout).toContain('Verification passed');
    });
  });

  describe('$schema', () => {
    test('warns (but passes) when $schema is missing', async () => {
      const pkg = validPlugin();
      delete pkg.$schema;
      const { exitCode, stdout } = await runVerify(pkg);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('$schema field is missing');
      expect(stdout).toContain('Verification passed');
    });

    test('warns (but passes) when $schema points to wrong host', async () => {
      const { exitCode, stdout } = await runVerify(
        validPlugin({ $schema: 'https://json.schemastore.org/package' })
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('does not point to schema.brika.dev');
      expect(stdout).toContain('Verification passed');
    });
  });

  describe('publish files coverage', () => {
    const pluginFiles = {
      'src/index.ts': 'export {};',
      'locales/en.json': '{}',
      'icon.svg': '<svg></svg>',
      'README.md': '# Plugin',
    };

    test('warns when icon field is missing', async () => {
      const { exitCode, stdout } = await runVerify(validPlugin());
      expect(exitCode).toBe(0);
      expect(stdout).toContain('icon is missing');
    });

    test('warns when files does not include important publish paths', async () => {
      const { exitCode, stdout } = await runVerify(
        validPlugin({
          icon: './icon.svg',
          files: ['src'],
        }),
        pluginFiles
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('files should include publish paths');
      expect(stdout).toContain('locales');
      expect(stdout).toContain('README.md');
      expect(stdout).toContain('icon.svg');
    });

    test('passes files coverage when all paths are listed', async () => {
      const { exitCode, stdout } = await runVerify(
        validPlugin({
          icon: './icon.svg',
          files: ['src', 'locales', 'icon.svg', 'README.md'],
        }),
        pluginFiles
      );
      expect(exitCode).toBe(0);
      expect(stdout).not.toContain('files should include publish paths');
    });
  });

  describe('schema validation', () => {
    test('fails when name is missing', async () => {
      const pkg = validPlugin();
      delete pkg.name;
      const { exitCode, stdout } = await runVerify(pkg);
      expect(exitCode).toBe(1);
      expect(stdout).toContain('Schema:');
    });

    test('fails when version is missing', async () => {
      const pkg = validPlugin();
      delete pkg.version;
      const { exitCode, stdout } = await runVerify(pkg);
      expect(exitCode).toBe(1);
      expect(stdout).toContain('Schema:');
    });

    test('fails when main is empty', async () => {
      const { exitCode, stdout } = await runVerify(validPlugin({ main: '' }), {}, false);
      expect(exitCode).toBe(1);
      expect(stdout).toContain('Schema: main:');
    });

    test('fails when name contains invalid characters', async () => {
      const { exitCode, stdout } = await runVerify(validPlugin({ name: 'My Plugin!!!' }));
      expect(exitCode).toBe(1);
      expect(stdout).toContain('Schema:');
    });
  });

  describe('error cases', () => {
    test('exits with error when package.json does not exist', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'brika-verify-empty-'));
      try {
        const proc = Bun.spawn(['bun', VERIFY_SCRIPT, dir], {
          stdout: 'pipe',
          stderr: 'pipe',
        });
        const exitCode = await proc.exited;
        expect(exitCode).toBe(1);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    test('multiple errors are all reported', async () => {
      // engines.brika incompatible + keywords missing 'brika' → two runtime errors (schema is valid)
      const pkg = validPlugin({ engines: { brika: '^0.1.0' }, keywords: ['something-else'] });
      const { exitCode, stdout } = await runVerify(pkg);
      expect(exitCode).toBe(1);
      expect(stdout).toMatch(/Verification failed — \d+ errors/);
    });
  });

  describe('output format', () => {
    test('includes plugin name and version in header', async () => {
      const { stdout } = await runVerify(validPlugin({ name: 'my-test-plugin', version: '2.3.4' }));
      expect(stdout).toContain('my-test-plugin');
      expect(stdout).toContain('2.3.4');
    });

    test('shows check count in failure summary', async () => {
      const pkg = validPlugin({ engines: { brika: '^0.1.0' } }); // 1 error: engines mismatch only
      const { stdout } = await runVerify(pkg);
      expect(stdout).toContain('Verification failed — 1 error');
    });
  });
});

// ─── Direct unit tests for verifyPlugin (gives SonarCloud coverage) ──────────

describe('verifyPlugin', () => {
  let tmpDir: string;

  async function setup(
    pkg: Record<string, unknown>,
    files: Record<string, string> = {},
    createMainFile = true
  ): Promise<string> {
    tmpDir = await mkdtemp(join(tmpdir(), 'brika-vp-'));
    const packageJson = { main: './src/index.ts', ...pkg };
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
      {
        'icon.svg': '<svg></svg>',
      }
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
    const dir = await setup({ version: '1.0.0', engines: { brika: `^${SDK_VERSION}` } });
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
      {
        'src/index.ts': 'export {};',
        'README.md': '# Plugin',
      }
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
    const raw = { dependencies: { '@brika/sdk': '^1.0.0' } };
    expect(readDependencyVersion(raw, '@brika/sdk')).toBe('^1.0.0');
  });

  test('returns version from peerDependencies', () => {
    const raw = { peerDependencies: { '@brika/sdk': '>=0.3.0' } };
    expect(readDependencyVersion(raw, '@brika/sdk')).toBe('>=0.3.0');
  });

  test('returns version from devDependencies', () => {
    const raw = { devDependencies: { '@brika/sdk': 'workspace:*' } };
    expect(readDependencyVersion(raw, '@brika/sdk')).toBe('workspace:*');
  });

  test('prefers dependencies over peerDependencies', () => {
    const raw = {
      dependencies: { '@brika/sdk': '^1.0.0' },
      peerDependencies: { '@brika/sdk': '^2.0.0' },
    };
    expect(readDependencyVersion(raw, '@brika/sdk')).toBe('^1.0.0');
  });

  test('prefers peerDependencies over devDependencies', () => {
    const raw = {
      peerDependencies: { '@brika/sdk': '^2.0.0' },
      devDependencies: { '@brika/sdk': '^3.0.0' },
    };
    expect(readDependencyVersion(raw, '@brika/sdk')).toBe('^2.0.0');
  });

  test('returns null when package is not found in any dependency map', () => {
    const raw = {
      dependencies: { lodash: '^4.0.0' },
      peerDependencies: { react: '^18.0.0' },
    };
    expect(readDependencyVersion(raw, '@brika/sdk')).toBeNull();
  });

  test('returns null when no dependency fields exist', () => {
    const raw = { name: 'my-package', version: '1.0.0' };
    expect(readDependencyVersion(raw, '@brika/sdk')).toBeNull();
  });

  test('returns null for non-object input', () => {
    expect(readDependencyVersion(null, '@brika/sdk')).toBeNull();
    expect(readDependencyVersion(undefined, '@brika/sdk')).toBeNull();
    expect(readDependencyVersion('string', '@brika/sdk')).toBeNull();
    expect(readDependencyVersion(42, '@brika/sdk')).toBeNull();
  });

  test('skips non-string version values', () => {
    const raw = {
      dependencies: { '@brika/sdk': 123 },
      peerDependencies: { '@brika/sdk': true },
      devDependencies: { '@brika/sdk': '^1.0.0' },
    };
    expect(readDependencyVersion(raw, '@brika/sdk')).toBe('^1.0.0');
  });

  test('skips non-object dependency maps', () => {
    const raw = {
      dependencies: 'not-an-object',
      peerDependencies: null,
      devDependencies: { '@brika/sdk': '^1.0.0' },
    };
    expect(readDependencyVersion(raw, '@brika/sdk')).toBe('^1.0.0');
  });
});
