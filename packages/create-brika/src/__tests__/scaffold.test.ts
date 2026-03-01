/**
 * Tests for scaffold module
 */

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parseCondition, render, resolveFilename } from '../render';
import { createTemplateData, type ScaffoldOptions, scaffold } from '../scaffold';

// Mock @clack/prompts
const mockSpinner = {
  start: mock(() => undefined),
  stop: mock(() => undefined),
};

const mockCancel = mock(() => undefined);
const mockNote = mock(() => undefined);
const mockLog = {
  warn: mock(() => undefined),
};

mock.module('@clack/prompts', () => ({
  spinner: () => mockSpinner,
  cancel: mockCancel,
  note: mockNote,
  log: mockLog,
}));

// Mock picocolors (pass through)
mock.module('picocolors', () => ({
  default: {
    black: (s: string) => s,
    bgCyan: (s: string) => s,
    bgYellow: (s: string) => s,
    cyan: (s: string) => s,
    red: (s: string) => s,
    yellow: (s: string) => s,
    green: (s: string) => s,
    bold: (s: string) => s,
    dim: (s: string) => s,
  },
}));

// ─── Render engine unit tests ───────────────────────────────────────────────

describe('render', () => {
  test('interpolates variables', () => {
    expect(
      render('Hello {{name}}!', {
        name: 'World',
      })
    ).toBe('Hello World!');
  });

  test('removes false conditional blocks', () => {
    const tpl = 'before\n{{#show}}\nvisible\n{{/show}}\nafter\n';
    expect(
      render(tpl, {
        show: false,
      })
    ).toBe('before\nafter\n');
  });

  test('keeps true conditional blocks', () => {
    const tpl = 'before\n{{#show}}\nvisible\n{{/show}}\nafter\n';
    expect(
      render(tpl, {
        show: true,
      })
    ).toBe('before\nvisible\nafter\n');
  });

  test('interpolates variables inside conditional blocks', () => {
    const tpl = '{{#show}}\nHello {{name}}\n{{/show}}\n';
    expect(
      render(tpl, {
        name: 'World',
        show: true,
      })
    ).toBe('Hello World\n');
  });

  test('collapses triple+ blank lines', () => {
    const tpl = 'a\n\n{{#x}}\nremoved\n{{/x}}\n\n{{#y}}\nremoved\n{{/y}}\n\nb\n';
    expect(
      render(tpl, {
        x: false,
        y: false,
      })
    ).toBe('a\n\nb\n');
  });

  test('treats non-empty strings as truthy in conditionals', () => {
    const tpl = '{{#name}}\nHello {{name}}\n{{/name}}\n';
    expect(
      render(tpl, {
        name: 'World',
      })
    ).toBe('Hello World\n');
    expect(
      render(tpl, {
        name: '',
      })
    ).toBe('');
  });

  test('ignores boolean values in interpolation', () => {
    expect(
      render('value: {{flag}}', {
        flag: true,
      })
    ).toBe('value: ');
  });
});

describe('resolveFilename', () => {
  test('strips .tpl extension', () => {
    expect(resolveFilename('index.ts.tpl', {})).toBe('index.ts');
  });

  test('strips .ts extension for generators', () => {
    expect(resolveFilename('package.json.ts', {})).toBe('package.json');
  });

  test('interpolates variables in filename', () => {
    expect(
      resolveFilename('{{name}}-config.tpl', {
        name: 'app',
      })
    ).toBe('app-config');
  });

  test('renames _gitignore to .gitignore', () => {
    expect(resolveFilename('_gitignore', {})).toBe('.gitignore');
  });

  test('passes through normal filenames', () => {
    expect(resolveFilename('README.md', {})).toBe('README.md');
  });
});

describe('parseCondition', () => {
  test('extracts [condition] prefix', () => {
    expect(parseCondition('[bricks]bricks')).toEqual({
      name: 'bricks',
      condition: 'bricks',
    });
  });

  test('returns name unchanged when no condition', () => {
    expect(parseCondition('src')).toEqual({
      name: 'src',
    });
  });
});

// ─── Scaffold integration tests ─────────────────────────────────────────────

describe('scaffold', () => {
  const testDir = `/tmp/brika-test-scaffold-${process.pid}-${Date.now()}`;
  let originalCwd: string;
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    mockSpinner.start.mockClear();
    mockSpinner.stop.mockClear();
    mockCancel.mockClear();
    mockNote.mockClear();
    mockLog.warn.mockClear();

    originalCwd = process.cwd();
    await fs.mkdir(testDir, {
      recursive: true,
    });
    process.chdir(testDir);

    fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          version: '1.0.0',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    );
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    try {
      await fs.rm(testDir, {
        recursive: true,
        force: true,
      });
    } catch {
      // Ignore cleanup errors
    }
    fetchSpy.mockRestore();
  });

  const defaultOptions: ScaffoldOptions = {
    name: 'test-plugin',
    description: 'A test plugin',
    features: [
      'blocks',
    ],
    category: 'action',
    author: 'Test Author',
    git: false,
    install: false,
  };

  // ─── Basic structure ──────────────────────────────────────────────

  test('creates plugin directory with correct structure', async () => {
    await scaffold(defaultOptions);

    const stat = await fs.stat(path.join(testDir, 'test-plugin'));
    expect(stat.isDirectory()).toBe(true);
  });

  test('creates package.json with correct name and displayName', async () => {
    await scaffold(defaultOptions);

    const pkg = JSON.parse(
      await fs.readFile(path.join(testDir, 'test-plugin', 'package.json'), 'utf-8')
    );
    expect(pkg.name).toBe('@brika/plugin-test-plugin');
    expect(pkg.displayName).toBe('TestPlugin');
  });

  test('creates .gitignore, src, and locales directories', async () => {
    await scaffold(defaultOptions);

    const base = path.join(testDir, 'test-plugin');
    const [gitignore, src, locales] = await Promise.all([
      fs.access(path.join(base, '.gitignore')).then(() => true),
      fs.stat(path.join(base, 'src')).then((s) => s.isDirectory()),
      fs.stat(path.join(base, 'locales')).then((s) => s.isDirectory()),
    ]);
    expect(gitignore).toBe(true);
    expect(src).toBe(true);
    expect(locales).toBe(true);
  });

  test('fetches SDK version from npm', async () => {
    await scaffold(defaultOptions);
    expect(fetchSpy).toHaveBeenCalledWith('https://registry.npmjs.org/@brika/sdk/latest');
  });

  test('throws error when directory already exists', async () => {
    await fs.mkdir(path.join(testDir, 'test-plugin'), {
      recursive: true,
    });
    await expect(scaffold(defaultOptions)).rejects.toThrow('cancelled');
    expect(mockCancel).toHaveBeenCalled();
  });

  test('handles npm fetch error', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Not found', {
        status: 404,
      })
    );
    await expect(scaffold(defaultOptions)).rejects.toThrow(
      'Failed to fetch @brika/sdk version: 404'
    );
  });

  // ─── Spinner / summary ────────────────────────────────────────────

  test('shows spinner messages during scaffold', async () => {
    await scaffold(defaultOptions);
    expect(mockSpinner.start).toHaveBeenCalledWith('Fetching latest SDK version');
    expect(mockSpinner.start).toHaveBeenCalledWith('Creating plugin files');
  });

  test('shows summary note after scaffold', async () => {
    await scaffold(defaultOptions);
    expect(mockNote).toHaveBeenCalled();
  });

  // ─── Git / install options ────────────────────────────────────────

  test('initializes git repository when git option is true', async () => {
    await scaffold({
      ...defaultOptions,
      git: true,
    });
    expect(mockSpinner.start).toHaveBeenCalledWith('Initializing git repository');
  });

  test('skips git init when git option is false', async () => {
    await scaffold({
      ...defaultOptions,
      git: false,
    });
    const calls = (mockSpinner.start.mock.calls as unknown[][]).map((c) => c[0]);
    expect(calls).not.toContain('Initializing git repository');
  });

  test('uses correct template variables for plugin name with hyphens', async () => {
    await scaffold({
      ...defaultOptions,
      name: 'my-awesome-plugin',
    });
    const content = await fs.readFile(
      path.join(testDir, 'my-awesome-plugin', 'package.json'),
      'utf-8'
    );
    expect(content).toContain('@brika/plugin-my-awesome-plugin');
  });

  // ─── Feature composition ──────────────────────────────────────────

  test('blocks-only: package.json has blocks, no bricks', async () => {
    await scaffold(defaultOptions);

    const pkg = JSON.parse(
      await fs.readFile(path.join(testDir, 'test-plugin', 'package.json'), 'utf-8')
    );
    expect(pkg.blocks).toBeDefined();
    expect(pkg.blocks[0].id).toBe('test-plugin');
    expect(pkg.bricks).toBeUndefined();
    expect(pkg.sparks).toBeUndefined();
    expect(pkg.keywords).toContain('brika-plugin');
    expect(pkg.scripts.prepublishOnly).toBe('brika-verify-plugin');
    expect(pkg.main).toBe('./src/index.ts');
  });

  test('bricks-only: tsconfig extends SDK base', async () => {
    await scaffold({
      ...defaultOptions,
      name: 'test-brick',
      features: [
        'bricks',
      ],
      category: 'general',
    });

    const tsconfig = JSON.parse(
      await fs.readFile(path.join(testDir, 'test-brick', 'tsconfig.json'), 'utf-8')
    );
    expect(tsconfig.extends).toBe('@brika/sdk/tsconfig.plugin.json');

    const pkg = JSON.parse(
      await fs.readFile(path.join(testDir, 'test-brick', 'package.json'), 'utf-8')
    );
    expect(pkg.bricks).toBeDefined();
    expect(pkg.bricks[0].id).toBe('test-brick');
    expect(pkg.blocks).toBeUndefined();
    expect(pkg.main).toBe('./src/index.ts');
  });

  test('bricks-only: creates brick component file', async () => {
    await scaffold({
      ...defaultOptions,
      name: 'test-brick',
      features: [
        'bricks',
      ],
      category: 'general',
    });

    const content = await fs.readFile(
      path.join(testDir, 'test-brick', 'src', 'bricks', 'board.tsx'),
      'utf-8'
    );
    expect(content).toContain('defineBrick');
    expect(content).toContain('useBrickSize');
    expect(content).toContain('testBrickBrick');
  });

  test('all features: package.json has blocks, bricks, and sparks', async () => {
    await scaffold({
      ...defaultOptions,
      name: 'test-all',
      features: [
        'blocks',
        'bricks',
        'sparks',
      ],
    });

    const pkg = JSON.parse(
      await fs.readFile(path.join(testDir, 'test-all', 'package.json'), 'utf-8')
    );
    expect(pkg.blocks).toBeDefined();
    expect(pkg.bricks).toBeDefined();
    expect(pkg.sparks).toBeDefined();
    expect(pkg.main).toBe('./src/index.ts');
  });

  test('sparks-only: package.json has sparks, no blocks or bricks', async () => {
    await scaffold({
      ...defaultOptions,
      name: 'test-spark',
      features: [
        'sparks',
      ],
      category: 'general',
    });

    const pkg = JSON.parse(
      await fs.readFile(path.join(testDir, 'test-spark', 'package.json'), 'utf-8')
    );
    expect(pkg.sparks).toBeDefined();
    expect(pkg.blocks).toBeUndefined();
    expect(pkg.bricks).toBeUndefined();
    expect(pkg.main).toBe('./src/index.ts');
  });

  test('entry file re-exports selected features', async () => {
    await scaffold({
      ...defaultOptions,
      name: 'test-combo',
      features: [
        'blocks',
        'sparks',
      ],
    });

    const content = await fs.readFile(path.join(testDir, 'test-combo', 'src', 'index.ts'), 'utf-8');
    expect(content).toContain("from './blocks/test-combo'");
    expect(content).toContain("from './sparks/test-combo'");
    expect(content).not.toContain('bricks/board');
  });

  test('blocks-only: creates block file in blocks/ directory', async () => {
    await scaffold(defaultOptions);

    const content = await fs.readFile(
      path.join(testDir, 'test-plugin', 'src', 'blocks', 'test-plugin.ts'),
      'utf-8'
    );
    expect(content).toContain('defineReactiveBlock');
    expect(content).toContain('testPlugin');
  });

  test('sparks-only: creates spark file in sparks/ directory', async () => {
    await scaffold({
      ...defaultOptions,
      name: 'test-spark',
      features: [
        'sparks',
      ],
      category: 'general',
    });

    const content = await fs.readFile(
      path.join(testDir, 'test-spark', 'src', 'sparks', 'test-spark.ts'),
      'utf-8'
    );
    expect(content).toContain('defineSpark');
    expect(content).toContain('testSparkSpark');
  });

  test('blocks+bricks: no duplicate export names', async () => {
    await scaffold({
      ...defaultOptions,
      name: 'test-both',
      features: [
        'blocks',
        'bricks',
      ],
    });

    const content = await fs.readFile(path.join(testDir, 'test-both', 'src', 'index.ts'), 'utf-8');
    expect(content).toContain('testBothBrick');
    expect(content).toContain("from './blocks/test-both'");
  });

  test('blocks-only: tsconfig extends SDK base', async () => {
    await scaffold(defaultOptions);

    const tsconfig = JSON.parse(
      await fs.readFile(path.join(testDir, 'test-plugin', 'tsconfig.json'), 'utf-8')
    );
    expect(tsconfig.extends).toBe('@brika/sdk/tsconfig.plugin.json');
  });

  test('creates both en and fr locale files', async () => {
    await scaffold(defaultOptions);

    const base = path.join(testDir, 'test-plugin', 'locales');
    const en = JSON.parse(await fs.readFile(path.join(base, 'en', 'plugin.json'), 'utf-8'));
    const fr = JSON.parse(await fs.readFile(path.join(base, 'fr', 'plugin.json'), 'utf-8'));

    expect(en.name).toBe('TestPlugin');
    expect(en.description).toBe('A test plugin');
    expect(fr.name).toBe('TestPlugin');
    expect(fr.description).toBe('A test plugin');
  });

  test('fr locale has translated field labels', async () => {
    await scaffold(defaultOptions);

    const fr = JSON.parse(
      await fs.readFile(path.join(testDir, 'test-plugin', 'locales', 'fr', 'plugin.json'), 'utf-8')
    );
    expect(fr.fields.enabled.label).toBe('Activé');
    expect(fr.fields.enabled.description).toBe('Activer le traitement');
  });

  test('manifest blocks/bricks/sparks have no name or description', async () => {
    await scaffold({
      ...defaultOptions,
      name: 'test-all',
      features: [
        'blocks',
        'bricks',
        'sparks',
      ],
    });

    const pkg = JSON.parse(
      await fs.readFile(path.join(testDir, 'test-all', 'package.json'), 'utf-8')
    );
    expect(pkg.blocks[0].name).toBeUndefined();
    expect(pkg.blocks[0].description).toBeUndefined();
    expect(pkg.bricks[0].name).toBeUndefined();
    expect(pkg.bricks[0].description).toBeUndefined();
    expect(pkg.sparks[0].name).toBeUndefined();
    expect(pkg.sparks[0].description).toBeUndefined();
  });

  test('conditional directories only created for selected features', async () => {
    await scaffold(defaultOptions);

    const base = path.join(testDir, 'test-plugin', 'src');
    const exists = async (dir: string) =>
      fs
        .access(path.join(base, dir))
        .then(() => true)
        .catch(() => false);
    expect(await exists('blocks')).toBe(true);
    expect(await exists('bricks')).toBe(false);
    expect(await exists('sparks')).toBe(false);
  });
});

// ─── createTemplateData ─────────────────────────────────────────────────────

describe('createTemplateData', () => {
  test('creates all required template data', () => {
    const data = createTemplateData(
      {
        name: 'my-plugin',
        description: 'My plugin',
        features: [
          'blocks',
        ],
        category: 'trigger',
        author: 'John',
      },
      '2.0.0'
    );

    expect(data).toEqual({
      name: 'my-plugin',
      packageName: '@brika/plugin-my-plugin',
      description: 'My plugin',
      category: 'trigger',
      author: 'John',
      id: 'my-plugin',
      pascal: 'MyPlugin',
      camel: 'myPlugin',
      sdkVersion: '2.0.0',
      blocks: true,
      bricks: false,
      sparks: false,
    });
  });

  test('handles multi-hyphen plugin names', () => {
    const data = createTemplateData(
      {
        name: 'my-awesome-plugin',
        description: 'Test',
        features: [
          'blocks',
        ],
        category: 'action',
        author: 'A',
      },
      '1.0.0'
    );
    expect(data.pascal).toBe('MyAwesomePlugin');
    expect(data.camel).toBe('myAwesomePlugin');
  });

  test('handles single word plugin names', () => {
    const data = createTemplateData(
      {
        name: 'timer',
        description: 'Timer',
        features: [
          'blocks',
        ],
        category: 'trigger',
        author: 'A',
      },
      '1.0.0'
    );
    expect(data.pascal).toBe('Timer');
    expect(data.camel).toBe('timer');
    expect(data.packageName).toBe('@brika/plugin-timer');
  });
});
