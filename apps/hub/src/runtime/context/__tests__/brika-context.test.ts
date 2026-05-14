import { describe, expect, test } from 'bun:test';
import { brikaContext } from '../brika-context';

/**
 * `brikaContext` is module-state — resolved once when the module is
 * loaded by the test runner. We can't easily exercise the
 * "generate-vs-read" branch in isolation without spawning a subprocess
 * with a fresh BRIKA_HOME, so the integration test focuses on shape +
 * invariants. The subprocess scenario is covered by the smoke test in
 * the mortar dev stack.
 */

describe('brikaContext', () => {
  test('exposes the documented shape', () => {
    expect(typeof brikaContext.brikaDir).toBe('string');
    expect(typeof brikaContext.rootDir).toBe('string');
    expect(typeof brikaContext.installDir).toBe('string');
    expect(typeof brikaContext.pluginsDir).toBe('string');
    expect(typeof brikaContext.dbDir).toBe('string');
    expect(typeof brikaContext.instanceId).toBe('string');
    expect(typeof brikaContext.serviceName).toBe('string');
    expect(typeof brikaContext.version).toBe('string');
    expect(typeof brikaContext.gitSha).toBe('string');
    expect(typeof brikaContext.gitCommit).toBe('string');
    expect(typeof brikaContext.buildDate).toBe('string');
    expect(typeof brikaContext.isCompiled).toBe('boolean');
    expect(typeof brikaContext.platform).toBe('string');
  });

  test('instanceId is 8-char lowercase hex', () => {
    expect(brikaContext.instanceId).toMatch(/^[0-9a-f]{8}$/);
  });

  test('serviceName is `dev.brika.hub.<instanceId>` (reverse-DNS)', () => {
    expect(brikaContext.serviceName).toBe(`dev.brika.hub.${brikaContext.instanceId}`);
  });

  test('derived paths agree with brikaDir', () => {
    expect(brikaContext.pluginsDir.startsWith(brikaContext.brikaDir)).toBe(true);
    expect(brikaContext.dbDir.startsWith(brikaContext.brikaDir)).toBe(true);
    expect(brikaContext.pluginsDir.endsWith('plugins/node_modules')).toBe(true);
    expect(brikaContext.dbDir.endsWith('/db')).toBe(true);
  });

  test('rootDir is the parent of brikaDir', () => {
    // dirname('/x/y/.brika') === '/x/y' — verify by reconstruction.
    const reconstructed = `${brikaContext.rootDir}/.brika`.replace('//.brika', '/.brika');
    // brikaDir ends with `.brika` in all paths we generate.
    expect(brikaContext.brikaDir.endsWith('.brika')).toBe(true);
    expect(reconstructed).toBe(brikaContext.brikaDir);
  });

  test('platform is one of the known Node platforms', () => {
    expect(['darwin', 'linux', 'win32', 'aix', 'freebsd', 'openbsd', 'sunos', 'android']).toContain(
      brikaContext.platform
    );
  });

  test('frozen — properties cannot be reassigned', () => {
    expect(Object.isFrozen(brikaContext)).toBe(true);
  });
});
