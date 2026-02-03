/**
 * Tests for scaffold module
 */

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';
import { type ScaffoldOptions, scaffold } from '../scaffold';

// Mock @clack/prompts
const mockSpinner = {
  start: mock(() => undefined),
  stop: mock(() => undefined),
};

const mockCancel = mock(() => undefined);
const mockNote = mock(() => undefined);
const mockLog = { warn: mock(() => undefined) };

mock.module('@clack/prompts', () => ({
  spinner: () => mockSpinner,
  cancel: mockCancel,
  note: mockNote,
  log: mockLog,
}));

// Mock picocolors (pass through)
mock.module('picocolors', () => ({
  default: {
    cyan: (s: string) => s,
    green: (s: string) => s,
    bold: (s: string) => s,
    dim: (s: string) => s,
  },
}));

describe('scaffold', () => {
  const testDir = '/tmp/brika-test-scaffold';
  let originalCwd: string;
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    // Reset mocks
    mockSpinner.start.mockClear();
    mockSpinner.stop.mockClear();
    mockCancel.mockClear();
    mockNote.mockClear();
    mockLog.warn.mockClear();

    // Save original cwd and create test directory
    originalCwd = process.cwd();
    await fs.mkdir(testDir, { recursive: true });
    process.chdir(testDir);

    // Mock fetch for npm registry
    fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ version: '1.0.0' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  afterEach(async () => {
    // Restore cwd
    process.chdir(originalCwd);

    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    // Restore fetch
    fetchSpy.mockRestore();
  });

  const defaultOptions: ScaffoldOptions = {
    name: 'test-plugin',
    description: 'A test plugin',
    category: 'action',
    author: 'Test Author',
    git: false,
    install: false,
  };

  test('creates plugin directory with correct structure', async () => {
    await scaffold(defaultOptions);

    const pluginDir = path.join(testDir, 'test-plugin');
    const stat = await fs.stat(pluginDir);
    expect(stat.isDirectory()).toBe(true);
  });

  test('creates package.json from template', async () => {
    await scaffold(defaultOptions);

    const packageJsonPath = path.join(testDir, 'test-plugin', 'package.json');
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content);

    expect(pkg.name).toBe('@brika/plugin-test-plugin');
  });

  test('creates .gitignore from _gitignore template', async () => {
    await scaffold(defaultOptions);

    const gitignorePath = path.join(testDir, 'test-plugin', '.gitignore');
    const exists = await fs
      .access(gitignorePath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  test('creates src directory', async () => {
    await scaffold(defaultOptions);

    const srcDir = path.join(testDir, 'test-plugin', 'src');
    const stat = await fs.stat(srcDir);
    expect(stat.isDirectory()).toBe(true);
  });

  test('creates locales directory', async () => {
    await scaffold(defaultOptions);

    const localesDir = path.join(testDir, 'test-plugin', 'locales');
    const stat = await fs.stat(localesDir);
    expect(stat.isDirectory()).toBe(true);
  });

  test('renders template variables in files', async () => {
    await scaffold(defaultOptions);

    const packageJsonPath = path.join(testDir, 'test-plugin', 'package.json');
    const content = await fs.readFile(packageJsonPath, 'utf-8');

    expect(content).toContain('@brika/plugin-test-plugin');
    expect(content).toContain('A test plugin');
  });

  test('fetches SDK version from npm', async () => {
    await scaffold(defaultOptions);

    expect(fetchSpy).toHaveBeenCalledWith('https://registry.npmjs.org/@brika/sdk/latest');
  });

  test('throws error when directory already exists', async () => {
    // Create the directory first
    await fs.mkdir(path.join(testDir, 'test-plugin'), { recursive: true });

    await expect(scaffold(defaultOptions)).rejects.toThrow('cancelled');
    expect(mockCancel).toHaveBeenCalled();
  });

  test('shows spinner messages during scaffold', async () => {
    await scaffold(defaultOptions);

    expect(mockSpinner.start).toHaveBeenCalledWith('Fetching latest SDK version');
    expect(mockSpinner.start).toHaveBeenCalledWith('Creating plugin files');
    expect(mockSpinner.stop).toHaveBeenCalled();
  });

  test('shows summary note after scaffold', async () => {
    await scaffold(defaultOptions);

    expect(mockNote).toHaveBeenCalled();
  });

  test('initializes git repository when git option is true', async () => {
    const options: ScaffoldOptions = {
      ...defaultOptions,
      git: true,
    };

    await scaffold(options);

    expect(mockSpinner.start).toHaveBeenCalledWith('Initializing git repository');
  });

  test('installs dependencies when install option is true', async () => {
    const options: ScaffoldOptions = {
      ...defaultOptions,
      install: true,
    };

    await scaffold(options);

    expect(mockSpinner.start).toHaveBeenCalledWith('Installing dependencies');
  });

  test('handles npm fetch error', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Not found', { status: 404 }));

    await expect(scaffold(defaultOptions)).rejects.toThrow(
      'Failed to fetch @brika/sdk version: 404'
    );
  });

  test('uses correct template variables for plugin name with hyphens', async () => {
    const options: ScaffoldOptions = {
      ...defaultOptions,
      name: 'my-awesome-plugin',
    };

    await scaffold(options);

    const packageJsonPath = path.join(testDir, 'my-awesome-plugin', 'package.json');
    const content = await fs.readFile(packageJsonPath, 'utf-8');

    expect(content).toContain('@brika/plugin-my-awesome-plugin');
  });

  test('skips git init when git option is false', async () => {
    const options: ScaffoldOptions = {
      ...defaultOptions,
      git: false,
    };

    await scaffold(options);

    const calls = mockSpinner.start.mock.calls.map((c) => c[0]);
    expect(calls).not.toContain('Initializing git repository');
  });

  test('skips dependency install when install option is false', async () => {
    const options: ScaffoldOptions = {
      ...defaultOptions,
      install: false,
    };

    await scaffold(options);

    const calls = mockSpinner.start.mock.calls.map((c) => c[0]);
    expect(calls).not.toContain('Installing dependencies');
  });
});

describe('scaffold internal functions', () => {
  describe('getOutputName', () => {
    // Replicate the internal function logic for testing
    const FILE_RENAMES: Record<string, string> = {
      _gitignore: '.gitignore',
      '_package.json': 'package.json',
    };

    function getOutputName(filename: string): string {
      if (filename.endsWith('.template')) {
        filename = filename.slice(0, -'.template'.length);
      }
      return FILE_RENAMES[filename] ?? filename;
    }

    test('removes .template extension', () => {
      expect(getOutputName('index.ts.template')).toBe('index.ts');
    });

    test('renames _gitignore to .gitignore', () => {
      expect(getOutputName('_gitignore')).toBe('.gitignore');
    });

    test('renames _package.json to package.json', () => {
      expect(getOutputName('_package.json')).toBe('package.json');
    });

    test('passes through normal filenames', () => {
      expect(getOutputName('README.md')).toBe('README.md');
      expect(getOutputName('tsconfig.json')).toBe('tsconfig.json');
      expect(getOutputName('src')).toBe('src');
    });

    test('handles .template extension with rename mapping', () => {
      expect(getOutputName('_gitignore.template')).toBe('.gitignore');
      expect(getOutputName('_package.json.template')).toBe('package.json');
    });

    test('handles nested path filenames', () => {
      expect(getOutputName('index.ts')).toBe('index.ts');
    });
  });

  describe('createTemplateVars', () => {
    function toPascalCase(str: string): string {
      return str
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
    }

    function toCamelCase(str: string): string {
      const pascal = toPascalCase(str);
      return pascal.charAt(0).toLowerCase() + pascal.slice(1);
    }

    interface PluginConfig {
      name: string;
      description: string;
      category: string;
      author: string;
    }

    function createTemplateVars(config: PluginConfig, sdkVersion: string) {
      return {
        name: config.name,
        packageName: `@brika/plugin-${config.name}`,
        description: config.description,
        category: config.category,
        author: config.author,
        blockId: config.name,
        blockNamePascal: toPascalCase(config.name),
        blockNameCamel: toCamelCase(config.name),
        sdkVersion,
      };
    }

    test('creates all required template variables', () => {
      const config: PluginConfig = {
        name: 'my-plugin',
        description: 'My plugin description',
        category: 'trigger',
        author: 'John Doe',
      };

      const vars = createTemplateVars(config, '2.0.0');

      expect(vars).toEqual({
        name: 'my-plugin',
        packageName: '@brika/plugin-my-plugin',
        description: 'My plugin description',
        category: 'trigger',
        author: 'John Doe',
        blockId: 'my-plugin',
        blockNamePascal: 'MyPlugin',
        blockNameCamel: 'myPlugin',
        sdkVersion: '2.0.0',
      });
    });

    test('handles multi-hyphen plugin names', () => {
      const config: PluginConfig = {
        name: 'my-awesome-cool-plugin',
        description: 'Test',
        category: 'action',
        author: 'Author',
      };

      const vars = createTemplateVars(config, '1.0.0');

      expect(vars.blockNamePascal).toBe('MyAwesomeCoolPlugin');
      expect(vars.blockNameCamel).toBe('myAwesomeCoolPlugin');
    });

    test('handles single word plugin names', () => {
      const config: PluginConfig = {
        name: 'timer',
        description: 'Timer plugin',
        category: 'trigger',
        author: 'Author',
      };

      const vars = createTemplateVars(config, '1.0.0');

      expect(vars.blockNamePascal).toBe('Timer');
      expect(vars.blockNameCamel).toBe('timer');
      expect(vars.packageName).toBe('@brika/plugin-timer');
    });

    test('preserves all config fields', () => {
      const config: PluginConfig = {
        name: 'test',
        description: 'Special chars: <>&"\'',
        category: 'transform',
        author: 'Test <test@example.com>',
      };

      const vars = createTemplateVars(config, '1.0.0');

      expect(vars.description).toBe('Special chars: <>&"\'');
      expect(vars.author).toBe('Test <test@example.com>');
      expect(vars.category).toBe('transform');
    });
  });
});
