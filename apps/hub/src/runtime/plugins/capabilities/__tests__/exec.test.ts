import { describe, expect, mock, test } from 'bun:test';
import { CapabilityRegistry } from '@brika/capabilities';
import { buildExecCapabilities, isBinaryAllowed } from '../exec';

describe('isBinaryAllowed', () => {
  test('matches a bare-name pattern by basename', () => {
    expect(isBinaryAllowed('/usr/local/bin/git', ['git'])).toBe(true);
    expect(isBinaryAllowed('git', ['git'])).toBe(true);
  });

  test('matches a path pattern only on full equality', () => {
    expect(isBinaryAllowed('/usr/bin/curl', ['/usr/bin/curl'])).toBe(true);
    expect(isBinaryAllowed('/opt/curl', ['/usr/bin/curl'])).toBe(false);
  });

  test('empty list denies everything', () => {
    expect(isBinaryAllowed('git', [])).toBe(false);
  });
});

function makeReg(spawn: Parameters<typeof buildExecCapabilities>[0]['spawn']) {
  const reg = new CapabilityRegistry();
  for (const cap of buildExecCapabilities({ spawn })) {
    reg.register(cap);
  }
  return reg;
}

const handlerCtx = (allow: string[]) => ({
  pluginUid: 'p',
  pluginRoot: '/tmp/p',
  grantedScope: { allowBinaries: allow },
  log: () => undefined,
});

describe('exec.spawn capability', () => {
  test('forwards command + args + cwd + timeout to the spawn callback', async () => {
    const spawn = mock(async () => ({
      exitCode: 0,
      signal: null,
      stdout: 'ok',
      stderr: '',
      timedOut: false,
    }));
    const reg = makeReg(spawn);
    const out = await reg.dispatch(
      'dev.brika.exec.spawn',
      { command: 'git', args: ['status'], cwd: '/repo', timeoutMs: 5000 },
      handlerCtx(['git'])
    );
    expect(out).toMatchObject({ exitCode: 0, stdout: 'ok', stderr: '', timedOut: false });
    expect(spawn).toHaveBeenCalledWith({
      command: 'git',
      args: ['status'],
      cwd: '/repo',
      timeoutMs: 5000,
    });
  });

  test('rejects a binary not on the allow list', async () => {
    const reg = makeReg(async () => {
      throw new Error('should not run');
    });
    await expect(
      reg.dispatch('dev.brika.exec.spawn', { command: 'curl', args: [] }, handlerCtx(['git']))
    ).rejects.toMatchObject({ code: 'HANDLER_THREW' });
  });

  test('caps very large output to 1MB with a truncation marker', async () => {
    const huge = 'x'.repeat(2 * 1024 * 1024);
    const reg = makeReg(async () => ({
      exitCode: 0,
      signal: null,
      stdout: huge,
      stderr: '',
      timedOut: false,
    }));
    const out = (await reg.dispatch(
      'dev.brika.exec.spawn',
      { command: 'git', args: [] },
      handlerCtx(['git'])
    )) as { stdout: string };
    expect(out.stdout.length).toBeLessThanOrEqual(1024 * 1024 + 64);
    expect(out.stdout).toContain('truncated');
  });

  test('reports timedOut when spawn flags it', async () => {
    const reg = makeReg(async () => ({
      exitCode: null,
      signal: 'SIGTERM',
      stdout: '',
      stderr: '',
      timedOut: true,
    }));
    const out = await reg.dispatch(
      'dev.brika.exec.spawn',
      { command: 'git', args: [] },
      handlerCtx(['git'])
    );
    expect(out).toMatchObject({ exitCode: null, signal: 'SIGTERM', timedOut: true });
  });

  test('rejects timeoutMs > 5min at spec validation', async () => {
    const reg = makeReg(async () => ({
      exitCode: 0,
      signal: null,
      stdout: '',
      stderr: '',
      timedOut: false,
    }));
    await expect(
      reg.dispatch(
        'dev.brika.exec.spawn',
        { command: 'git', args: [], timeoutMs: 600_000 },
        handlerCtx(['git'])
      )
    ).rejects.toMatchObject({ code: 'INVALID_ARGS' });
  });
});
