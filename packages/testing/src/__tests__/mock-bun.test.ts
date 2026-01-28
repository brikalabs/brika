import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { BunMock, mockBun, useBunMock } from '../index';

describe('BunMock', () => {
  let bun: BunMock;

  beforeEach(() => {
    bun = mockBun();
  });

  afterEach(() => {
    bun.restore();
  });

  describe('fs()', () => {
    test('creates virtual filesystem from file paths (auto-infers directories)', async () => {
      bun
        .fs({
          '/config.json': { port: 3000 },
          '/locales/en/common.json': { greeting: 'Hello' },
          '/locales/en/nav.json': { home: 'Home' },
          '/locales/fr/common.json': { greeting: 'Bonjour' },
        })
        .apply();

      // Files
      expect(await Bun.file('/config.json').json()).toEqual({ port: 3000 });
      expect(await Bun.file('/locales/en/common.json').json()).toEqual({ greeting: 'Hello' });

      // Directories (auto-inferred)
      const locales = await Array.fromAsync(new Bun.Glob('*/').scan({ cwd: '/locales' }));
      expect(locales).toEqual(['en/', 'fr/']);

      const enFiles = await Array.fromAsync(new Bun.Glob('*.json').scan({ cwd: '/locales/en' }));
      expect(enFiles).toEqual(['common.json', 'nav.json']);
    });

    test('supports explicit directory definitions for ordering', async () => {
      bun
        .fs({
          '/locales/': ['fr/', 'en/', 'de/'], // explicit order
          '/locales/en/common.json': {},
          '/locales/fr/common.json': {},
          '/locales/de/common.json': {},
        })
        .apply();

      const locales = await Array.fromAsync(new Bun.Glob('*/').scan({ cwd: '/locales' }));
      expect(locales).toEqual(['fr/', 'en/', 'de/']); // maintains explicit order
    });

    test('supports empty directories', async () => {
      bun
        .fs({
          '/locales/en/': [],
        })
        .apply();

      // Parent directory should be inferred
      const locales = await Array.fromAsync(new Bun.Glob('*/').scan({ cwd: '/locales' }));
      expect(locales).toEqual(['en/']);

      // Empty directory
      const enFiles = await Array.fromAsync(new Bun.Glob('*.json').scan({ cwd: '/locales/en' }));
      expect(enFiles).toEqual([]);
    });
  });

  describe('file()', () => {
    test('mocks file with JSON content', async () => {
      bun.file('/test.json', { key: 'value' }).apply();

      expect(await Bun.file('/test.json').json()).toEqual({ key: 'value' });
    });

    test('mocks file existence', async () => {
      bun.file('/exists.json', { data: true }).apply();

      expect(await Bun.file('/exists.json').exists()).toBe(true);
      expect(await Bun.file('/missing.json').exists()).toBe(false);
    });

    test('throws ENOENT on missing file', () => {
      bun.apply();

      expect(Bun.file('/missing.json').json()).rejects.toThrow('ENOENT');
    });

    test('mocks text content', async () => {
      bun.file('/readme.txt', 'Hello World').apply();

      expect(await Bun.file('/readme.txt').text()).toBe('Hello World');
    });
  });

  describe('write()', () => {
    test('updates virtual fs', async () => {
      bun.apply();

      await Bun.write('/new.json', JSON.stringify({ created: true }));

      expect(await Bun.file('/new.json').json()).toEqual({ created: true });
      expect(bun.hasFile('/new.json')).toBe(true);
      expect(bun.getFile('/new.json')).toMatchObject({ created: true });
    });
  });

  describe('directory()', () => {
    test('mocks glob scan for directories', async () => {
      bun.directory('/locales', ['en/', 'fr/', 'de/']).apply();

      const dirs = await Array.fromAsync(new Bun.Glob('*/').scan({ cwd: '/locales' }));
      expect(dirs).toEqual(['en/', 'fr/', 'de/']);
    });

    test('mocks glob scan for files', async () => {
      bun.directory('/src', ['index.ts', 'utils.ts', 'README.md']).apply();

      const files = await Array.fromAsync(new Bun.Glob('*.ts').scan({ cwd: '/src' }));
      expect(files).toEqual(['index.ts', 'utils.ts']);
    });

    test('returns empty for unknown directory', async () => {
      bun.apply();

      const dirs = await Array.fromAsync(new Bun.Glob('*/').scan({ cwd: '/unknown' }));
      expect(dirs).toEqual([]);
    });
  });

  describe('spawn()', () => {
    test('mocks exit code', async () => {
      bun.spawn({ exitCode: 0 }).apply();
      expect(await Bun.spawn(['test']).exited).toBe(0);
    });

    test('mocks non-zero exit code', async () => {
      bun.spawn({ exitCode: 1 }).apply();
      expect(await Bun.spawn(['fail']).exited).toBe(1);
    });

    test('mocks stderr', async () => {
      bun.spawn({ stderr: 'Error!' }).apply();

      const proc = Bun.spawn(['cmd']);
      expect(await new Response(proc.stderr).text()).toBe('Error!');
    });

    test('records calls', () => {
      bun.apply();

      Bun.spawn(['npm', 'install']);
      Bun.spawn(['bun', 'test'], { cwd: '/project' });

      expect(bun.spawnCalls).toHaveLength(2);
      expect(bun.spawnCalls[0]?.cmd).toEqual(['npm', 'install']);
      expect(bun.spawnCalls[1]?.cmd).toEqual(['bun', 'test']);
    });

    test('clearSpawnCalls resets history', () => {
      bun.apply();

      Bun.spawn(['first']);
      expect(bun.spawnCalls).toHaveLength(1);

      bun.clearSpawnCalls();
      expect(bun.spawnCalls).toHaveLength(0);

      Bun.spawn(['second']);
      expect(bun.spawnCalls).toHaveLength(1);
      expect(bun.spawnCalls[0]?.cmd).toEqual(['second']);
    });
  });

  describe('resolve()', () => {
    test('mocks resolveSync', () => {
      bun.resolve('@test/pkg', '/node_modules/@test/pkg/index.js').apply();

      expect(Bun.resolveSync('@test/pkg', '/')).toBe('/node_modules/@test/pkg/index.js');
    });

    test('throws for unknown package', () => {
      bun.apply();

      expect(() => Bun.resolveSync('@unknown/pkg', '/')).toThrow('Cannot resolve');
    });
  });

  describe('hasFile() / getFile()', () => {
    test('checks and retrieves files', () => {
      bun.file('/data.json', { items: [1, 2, 3] }).apply();

      expect(bun.hasFile('/data.json')).toBe(true);
      expect(bun.hasFile('/missing.json')).toBe(false);
      expect(bun.getFile('/data.json')).toMatchObject({ items: [1, 2, 3] });
      expect(bun.getFile('/missing.json')).toBeUndefined();
    });
  });

  describe('restore()', () => {
    test('restores Bun.Glob', () => {
      const original = Bun.Glob;
      bun.apply();

      expect(Bun.Glob).not.toBe(original);

      bun.restore();

      expect(Bun.Glob).toBe(original);
    });

    test('clears all state', async () => {
      bun
        .file('/test.json', { data: true })
        .directory('/dir', ['a/', 'b/'])
        .spawn({ exitCode: 0 })
        .apply();

      Bun.spawn(['cmd']);
      expect(bun.spawnCalls).toHaveLength(1);

      bun.restore();
      bun.apply();

      expect(await Bun.file('/test.json').exists()).toBe(false);
      expect(await Array.fromAsync(new Bun.Glob('*/').scan({ cwd: '/dir' }))).toEqual([]);
      expect(bun.spawnCalls).toHaveLength(0);
    });
  });

  describe('real world examples', () => {
    test('i18n service', async () => {
      bun
        .fs({
          '/app/locales/en/common.json': { hello: 'Hello', bye: 'Goodbye' },
          '/app/locales/en/nav.json': { home: 'Home' },
          '/app/locales/fr/common.json': { hello: 'Bonjour' },
        })
        .apply();

      // Load locales
      const locales: string[] = [];
      for await (const dir of new Bun.Glob('*/').scan({ cwd: '/app/locales' })) {
        locales.push(dir.replace('/', ''));
      }
      expect(locales).toEqual(['en', 'fr']);

      // Load translations
      expect(await Bun.file('/app/locales/en/common.json').json()).toEqual({
        hello: 'Hello',
        bye: 'Goodbye',
      });
      expect(await Bun.file('/app/locales/fr/common.json').json()).toEqual({ hello: 'Bonjour' });
    });

    test('plugin registry', async () => {
      bun
        .fs({
          '/plugins/package.json': { dependencies: { '@test/plugin': '^1.0.0' } },
          '/plugins/node_modules/@test/plugin/package.json': { version: '1.2.3' },
        })
        .spawn({ exitCode: 0 })
        .resolve('@test/plugin', '/plugins/node_modules/@test/plugin/index.js')
        .apply();

      // Check dependencies
      const pkg = await Bun.file('/plugins/package.json').json();
      expect(pkg.dependencies['@test/plugin']).toBe('^1.0.0');

      // Resolve package
      expect(Bun.resolveSync('@test/plugin', '/plugins')).toContain('@test/plugin');

      // Run install
      Bun.spawn(['bun', 'install'], { cwd: '/plugins' });
      expect(bun.spawnCalls[0]?.cmd).toEqual(['bun', 'install']);
    });
  });
});

describe('useBunMock', () => {
  const bun = useBunMock();

  test('auto-manages lifecycle', async () => {
    bun.file('/test.json', { value: 42 }).apply();

    expect(await Bun.file('/test.json').json()).toEqual({ value: 42 });
  });

  test('resets between tests', async () => {
    // Previous test's file should not exist
    expect(await Bun.file('/test.json').exists()).toBe(false);

    bun.file('/other.json', { data: true }).apply();
    expect(await Bun.file('/other.json').json()).toEqual({ data: true });
  });

  test('supports all BunMock methods', () => {
    bun
      .fs({ '/config.json': { port: 3000 } })
      .spawn({ exitCode: 0 })
      .resolve('@test/pkg', '/node_modules/@test/pkg/index.js')
      .apply();

    Bun.spawn(['test']);
    expect(bun.spawnCalls).toHaveLength(1);
    expect(Bun.resolveSync('@test/pkg', '/')).toBe('/node_modules/@test/pkg/index.js');
  });
});
