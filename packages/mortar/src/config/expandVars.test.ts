import { describe, expect, test } from 'bun:test';
import { expandServiceVars, expandVars } from './expandVars';
import type { ServiceSpec } from './types';

const vars = { root: '/abs/project' };

describe('expandVars', () => {
  test('replaces ${root}', () => {
    expect(expandVars('${root}/data', vars)).toBe('/abs/project/data');
  });

  test('replaces multiple ${root} occurrences', () => {
    expect(expandVars('${root}/a:${root}/b', vars)).toBe('/abs/project/a:/abs/project/b');
  });

  test('leaves bare ${NAME} alone (must use env: prefix)', () => {
    expect(expandVars('${HOME}/dir', vars)).toBe('${HOME}/dir');
  });

  test('expands ${env:NAME} from process.env', () => {
    const original = process.env.MORTAR_TEST_EXPAND;
    process.env.MORTAR_TEST_EXPAND = 'hello';
    try {
      expect(expandVars('${env:MORTAR_TEST_EXPAND}/world', vars)).toBe('hello/world');
    } finally {
      if (original === undefined) {
        delete process.env.MORTAR_TEST_EXPAND;
      } else {
        process.env.MORTAR_TEST_EXPAND = original;
      }
    }
  });

  test('${env:NAME} resolves missing vars to empty string', () => {
    delete process.env.__MORTAR_DEFINITELY_UNSET__;
    expect(expandVars('x${env:__MORTAR_DEFINITELY_UNSET__}y', vars)).toBe('xy');
  });

  test('returns unchanged when no placeholders are present', () => {
    expect(expandVars('plain string', vars)).toBe('plain string');
    expect(expandVars('', vars)).toBe('');
  });
});

describe('expandServiceVars', () => {
  function svc(overrides: Partial<ServiceSpec> = {}): ServiceSpec {
    return {
      id: 'x',
      label: 'X',
      command: 'cmd',
      env: {},
      dependsOn: [],
      cwd: null,
      port: null,
      health: { kind: 'none' },
      url: null,
      ...overrides,
    };
  }

  test('expands ${root} in env values', () => {
    const out = expandServiceVars(
      svc({ env: { DATA_DIR: '${root}/.brika', OTHER: 'plain' } }),
      vars
    );
    expect(out.env).toEqual({ DATA_DIR: '/abs/project/.brika', OTHER: 'plain' });
  });

  test('expands command, cwd, and url too', () => {
    const out = expandServiceVars(
      svc({ command: 'bun ${root}/scripts/run.ts', cwd: '${root}/apps/x', url: '${root}/static/' }),
      vars
    );
    expect(out.command).toBe('bun /abs/project/scripts/run.ts');
    expect(out.cwd).toBe('/abs/project/apps/x');
    expect(out.url).toBe('/abs/project/static/');
  });

  test('preserves null fields as null', () => {
    const out = expandServiceVars(svc({ cwd: null, url: null }), vars);
    expect(out.cwd).toBeNull();
    expect(out.url).toBeNull();
  });

  test('returns a new object (does not mutate input)', () => {
    const input = svc({ env: { X: '${root}/y' } });
    const out = expandServiceVars(input, vars);
    expect(input.env.X).toBe('${root}/y');
    expect(out.env.X).toBe('/abs/project/y');
    expect(out).not.toBe(input);
  });
});
