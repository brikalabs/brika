import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  configExists,
  configPath,
  DEFAULT_CONFIG_YAML,
  findConfig,
  loadConfig,
  type ServiceSpec,
  saveConfig,
  saveDefaultConfig,
  serviceUrl,
  topologicalLayers,
  validateConfig,
} from '.';

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'mortar-config-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

// ─── findConfig ─────────────────────────────────────────────────────────────

describe('findConfig', () => {
  test('returns the path when mortar.yml lives in cwd', async () => {
    const path = join(workDir, 'mortar.yml');
    await writeFile(path, 'services: {}');
    expect(findConfig(workDir)).toBe(path);
  });

  test('walks up parent directories', async () => {
    const nested = join(workDir, 'a', 'b', 'c');
    await mkdir(nested, { recursive: true });
    const expected = join(workDir, 'mortar.yml');
    await writeFile(expected, 'services: {}');
    expect(findConfig(nested)).toBe(expected);
  });

  test('returns null when no config is reachable', () => {
    expect(findConfig(workDir)).toBeNull();
  });

  test('stops at the filesystem root without throwing', () => {
    // tmpdir is many levels below /, so this implicitly walks to root.
    expect(findConfig(workDir)).toBeNull();
  });

  test('prefers the closest mortar.yml', async () => {
    const outer = join(workDir, 'mortar.yml');
    const innerDir = join(workDir, 'inner');
    await mkdir(innerDir);
    const inner = join(innerDir, 'mortar.yml');
    await writeFile(outer, 'services: {}');
    await writeFile(inner, 'services: {}');
    expect(findConfig(innerDir)).toBe(inner);
  });
});

// ─── configExists ───────────────────────────────────────────────────────────

describe('configExists', () => {
  test('true when found in cwd', async () => {
    await writeFile(join(workDir, 'mortar.yml'), 'services: {}');
    expect(configExists(workDir)).toBe(true);
  });

  test('true when found in a parent', async () => {
    const nested = join(workDir, 'a');
    await mkdir(nested);
    await writeFile(join(workDir, 'mortar.yml'), 'services: {}');
    expect(configExists(nested)).toBe(true);
  });

  test('false when no config reachable', () => {
    expect(configExists(workDir)).toBe(false);
  });
});

// ─── configPath ─────────────────────────────────────────────────────────────

describe('configPath', () => {
  test('joins cwd with the canonical filename', () => {
    expect(configPath('/some/dir')).toBe('/some/dir/mortar.yml');
  });

  test('defaults to process.cwd()', () => {
    expect(configPath()).toBe(join(process.cwd(), 'mortar.yml'));
  });
});

// ─── validateConfig ─────────────────────────────────────────────────────────

describe('validateConfig', () => {
  test('parses a minimal valid config (health defaults to auto)', () => {
    const cfg = validateConfig({
      services: {
        a: { label: 'A', command: 'echo a' },
      },
    });
    expect(cfg.services).toHaveLength(1);
    expect(cfg.services[0]).toMatchObject({
      id: 'a',
      label: 'A',
      command: 'echo a',
      env: {},
      dependsOn: [],
      health: { kind: 'auto', timeoutMs: 30_000 },
      url: null,
      cwd: null,
    });
  });

  test('parses an explicit per-service cwd', () => {
    const cfg = validateConfig({
      services: { a: { label: 'A', command: 'a', cwd: 'apps/x' } },
    });
    expect(cfg.services[0]?.cwd).toBe('apps/x');
  });

  test('parses an explicit per-service url', () => {
    const cfg = validateConfig({
      services: {
        a: { label: 'A', command: 'a', url: 'http://localhost:5174/?hub=devhub' },
      },
    });
    expect(cfg.services[0]?.url).toBe('http://localhost:5174/?hub=devhub');
  });

  test('parses health: auto with default timeout', () => {
    const cfg = validateConfig({
      services: { a: { label: 'A', command: 'a', health: { kind: 'auto' } } },
    });
    expect(cfg.services[0]?.health).toEqual({ kind: 'auto', timeoutMs: 30_000 });
  });

  test('parses health: auto with explicit timeout', () => {
    const cfg = validateConfig({
      services: {
        a: { label: 'A', command: 'a', health: { kind: 'auto', timeoutMs: 5_000 } },
      },
    });
    expect(cfg.services[0]?.health).toEqual({ kind: 'auto', timeoutMs: 5_000 });
  });

  test('parses http health', () => {
    const cfg = validateConfig({
      services: {
        a: {
          label: 'A',
          command: 'a',
          health: { kind: 'http', url: 'http://x/health', timeoutMs: 5000 },
        },
      },
    });
    expect(cfg.services[0]?.health).toEqual({
      kind: 'http',
      url: 'http://x/health',
      timeoutMs: 5000,
    });
  });

  test('parses tcp health with default timeout', () => {
    const cfg = validateConfig({
      services: {
        a: { label: 'A', command: 'a', health: { kind: 'tcp', port: 1234 } },
      },
    });
    expect(cfg.services[0]?.health).toEqual({ kind: 'tcp', port: 1234, timeoutMs: 15_000 });
  });

  test('parses none health when explicit', () => {
    const cfg = validateConfig({
      services: { a: { label: 'A', command: 'a', health: { kind: 'none' } } },
    });
    expect(cfg.services[0]?.health).toEqual({ kind: 'none' });
  });

  test('coerces env numbers and booleans to strings', () => {
    const cfg = validateConfig({
      services: {
        a: { label: 'A', command: 'a', env: { PORT: 8080, DEBUG: true, NAME: 'foo' } },
      },
    });
    expect(cfg.services[0]?.env).toEqual({ PORT: '8080', DEBUG: 'true', NAME: 'foo' });
  });

  test('preserves dependsOn array', () => {
    const cfg = validateConfig({
      services: {
        a: { label: 'A', command: 'a' },
        b: { label: 'B', command: 'b', dependsOn: ['a'] },
      },
    });
    const b = cfg.services.find((s) => s.id === 'b');
    expect(b?.dependsOn).toEqual(['a']);
  });

  test('rejects non-object root', () => {
    expect(() => validateConfig(null)).toThrow(/must be a mapping/);
    expect(() => validateConfig('hi')).toThrow(/must be a mapping/);
    expect(() => validateConfig([])).toThrow(/must be a mapping/);
  });

  test('rejects empty services map', () => {
    expect(() => validateConfig({ services: {} })).toThrow(/at least one service is required/);
  });

  test('rejects unknown health kind', () => {
    expect(() =>
      validateConfig({
        services: { a: { label: 'A', command: 'a', health: { kind: 'whatever' } } },
      })
    ).toThrow(/must be one of "http", "tcp", "auto", "none"/);
  });

  test('rejects missing required string', () => {
    expect(() => validateConfig({ services: { a: { command: 'a' } } })).toThrow(
      /services\.a\.label.*non-empty string/
    );
  });

  test('rejects out-of-range port', () => {
    expect(() =>
      validateConfig({
        services: { a: { label: 'A', command: 'a', health: { kind: 'tcp', port: 0 } } },
      })
    ).toThrow(/port/);
    expect(() =>
      validateConfig({
        services: { a: { label: 'A', command: 'a', health: { kind: 'tcp', port: 70_000 } } },
      })
    ).toThrow(/port/);
  });

  test('rejects non-integer timeoutMs', () => {
    expect(() =>
      validateConfig({
        services: {
          a: {
            label: 'A',
            command: 'a',
            health: { kind: 'http', url: 'http://x', timeoutMs: 1.5 },
          },
        },
      })
    ).toThrow(/timeoutMs.*positive integer/);
  });

  test('rejects unknown dependsOn target', () => {
    expect(() =>
      validateConfig({
        services: {
          a: { label: 'A', command: 'a', dependsOn: ['ghost'] },
        },
      })
    ).toThrow(/unknown service "ghost"/);
  });

  test('rejects 2-cycle a→b→a', () => {
    expect(() =>
      validateConfig({
        services: {
          a: { label: 'A', command: 'a', dependsOn: ['b'] },
          b: { label: 'B', command: 'b', dependsOn: ['a'] },
        },
      })
    ).toThrow(/dependency cycle detected.*a.*→.*b.*→.*a/);
  });

  test('rejects 3-cycle a→b→c→a', () => {
    expect(() =>
      validateConfig({
        services: {
          a: { label: 'A', command: 'a', dependsOn: ['b'] },
          b: { label: 'B', command: 'b', dependsOn: ['c'] },
          c: { label: 'C', command: 'c', dependsOn: ['a'] },
        },
      })
    ).toThrow(/dependency cycle detected/);
  });

  test('rejects self-dependency', () => {
    expect(() =>
      validateConfig({
        services: {
          a: { label: 'A', command: 'a', dependsOn: ['a'] },
        },
      })
    ).toThrow(/cannot depend on itself/);
  });

  test('rejects non-array dependsOn', () => {
    expect(() =>
      validateConfig({
        services: { a: { label: 'A', command: 'a', dependsOn: 'b' } },
      })
    ).toThrow(/array of strings/);
  });

  test('rejects non-string env value of wrong shape', () => {
    expect(() =>
      validateConfig({
        services: { a: { label: 'A', command: 'a', env: { X: { nested: true } } } },
      })
    ).toThrow(/string\/number\/boolean/);
  });

  test('rejects services entry that is not a mapping', () => {
    expect(() => validateConfig({ services: { a: 'not a mapping' } })).toThrow(/must be a mapping/);
  });
});

// ─── loadConfig / saveConfig / saveDefaultConfig ────────────────────────────

describe('loadConfig', () => {
  test('reads and parses an existing file', async () => {
    const path = join(workDir, 'mortar.yml');
    await writeFile(
      path,
      [
        'services:',
        '  a:',
        '    label: A',
        '    command: echo a',
        '    health:',
        '      kind: tcp',
        '      port: 1234',
      ].join('\n')
    );
    const resolved = await loadConfig(workDir);
    expect(resolved.path).toBe(path);
    expect(resolved.root).toBe(workDir);
    expect(resolved.config.services[0]?.health).toEqual({
      kind: 'tcp',
      port: 1234,
      timeoutMs: 15_000,
    });
  });

  test('throws a friendly error when no config is found', async () => {
    await expect(loadConfig(workDir)).rejects.toThrow(/No mortar\.yml found.*mortar init/);
  });

  test('walks up to find a parent config', async () => {
    await writeFile(join(workDir, 'mortar.yml'), 'services: { a: { label: A, command: a } }');
    const nested = join(workDir, 'inner');
    await mkdir(nested);
    const resolved = await loadConfig(nested);
    expect(resolved.root).toBe(workDir);
  });
});

describe('saveDefaultConfig', () => {
  test('writes the canonical default YAML and returns its path', async () => {
    const path = await saveDefaultConfig(workDir);
    expect(path).toBe(join(workDir, 'mortar.yml'));
    const written = await readFile(path, 'utf8');
    expect(written).toBe(DEFAULT_CONFIG_YAML);
  });

  test('the default YAML round-trips through validateConfig', async () => {
    await saveDefaultConfig(workDir);
    const resolved = await loadConfig(workDir);
    expect(resolved.config.services.length).toBeGreaterThan(0);
  });
});

describe('saveConfig', () => {
  test('serializes a config and round-trips through loadConfig', async () => {
    const path = await saveConfig(
      {
        services: [
          {
            id: 'a',
            label: 'A',
            command: 'echo a',
            env: { K: 'v' },
            dependsOn: [],
            health: { kind: 'none' },
            url: 'http://localhost:9999/',
            cwd: null,
            port: null,
          },
        ],
      },
      workDir
    );
    expect(path).toBe(join(workDir, 'mortar.yml'));
    const text = await readFile(path, 'utf8');
    expect(text).toContain('url: http://localhost:9999/');
    const resolved = await loadConfig(workDir);
    expect(resolved.config.services[0]?.env).toEqual({ K: 'v' });
    expect(resolved.config.services[0]?.url).toBe('http://localhost:9999/');
  });

  test('includes cwd in serialized output when non-null', async () => {
    await saveConfig(
      {
        services: [
          {
            id: 'a',
            label: 'A',
            command: 'echo a',
            env: {},
            dependsOn: [],
            health: { kind: 'none' },
            url: null,
            cwd: 'apps/sub',
            port: null,
          },
        ],
      },
      workDir
    );
    const text = await readFile(join(workDir, 'mortar.yml'), 'utf8');
    expect(text).toContain('cwd:');
    const resolved = await loadConfig(workDir);
    expect(resolved.config.services[0]?.cwd).toBe('apps/sub');
  });

  test('includes port in serialized output when non-null', async () => {
    await saveConfig(
      {
        services: [
          {
            id: 'a',
            label: 'A',
            command: 'echo a',
            env: {},
            dependsOn: [],
            health: { kind: 'none' },
            url: null,
            cwd: null,
            port: 5173,
          },
        ],
      },
      workDir
    );
    const text = await readFile(join(workDir, 'mortar.yml'), 'utf8');
    expect(text).toContain('port:');
    const resolved = await loadConfig(workDir);
    // port is preserved; the validator upgrades health from none to tcp
    expect(resolved.config.services[0]?.port).toBe(5173);
  });

  test('omits url:null from serialized output', async () => {
    await saveConfig(
      {
        services: [
          {
            id: 'a',
            label: 'A',
            command: 'echo a',
            env: {},
            dependsOn: [],
            health: { kind: 'none' },
            url: null,
            cwd: null,
            port: null,
          },
        ],
      },
      workDir
    );
    const text = await readFile(join(workDir, 'mortar.yml'), 'utf8');
    expect(text).not.toContain('url:');
    expect(text).not.toContain('cwd:');
  });
});

// ─── serviceUrl ─────────────────────────────────────────────────────────────

describe('serviceUrl', () => {
  const base: ServiceSpec = {
    id: 'a',
    label: 'A',
    command: 'cmd',
    env: {},
    dependsOn: [],
    port: null,
    health: { kind: 'none' },
    url: null,
    cwd: null,
  };

  test('explicit spec.url wins over everything', () => {
    expect(
      serviceUrl(
        { ...base, url: 'http://x/?q=1', health: { kind: 'tcp', port: 1234, timeoutMs: 1 } },
        5678
      )
    ).toBe('http://x/?q=1');
  });

  test('uses the declared spec.port to build the URL', () => {
    expect(serviceUrl({ ...base, port: 3000 })).toBe('http://localhost:3000/');
  });

  test('uses the runtime-detected port when no explicit url', () => {
    expect(serviceUrl({ ...base, health: { kind: 'auto', timeoutMs: 1 } }, 5678)).toBe(
      'http://localhost:5678/'
    );
  });

  test('derives from tcp port when no override and no detected port', () => {
    expect(serviceUrl({ ...base, health: { kind: 'tcp', port: 5173, timeoutMs: 1 } })).toBe(
      'http://localhost:5173/'
    );
  });

  test('derives from http url origin', () => {
    expect(
      serviceUrl({
        ...base,
        health: { kind: 'http', url: 'http://localhost:8787/v1/health', timeoutMs: 1 },
      })
    ).toBe('http://localhost:8787/');
  });

  test('returns null when http url is malformed', () => {
    expect(
      serviceUrl({ ...base, health: { kind: 'http', url: 'not a url', timeoutMs: 1 } })
    ).toBeNull();
  });

  test('returns null for health:none without explicit url', () => {
    expect(serviceUrl(base)).toBeNull();
  });

  test('returns null for health:auto without detected port', () => {
    expect(serviceUrl({ ...base, health: { kind: 'auto', timeoutMs: 1 } })).toBeNull();
  });
});
