import { beforeEach, describe, expect, test } from 'bun:test';
import { brix } from './brixLog';
import { faceOf } from './moods';

interface Captured {
  out: string;
  err: string;
}

function withCapture(run: () => void): Captured {
  const originalOut = process.stdout.write.bind(process.stdout);
  const originalErr = process.stderr.write.bind(process.stderr);
  let out = '';
  let err = '';
  // biome-ignore lint/suspicious/noExplicitAny: intercepting overloaded write — safe for tests.
  process.stdout.write = ((chunk: any) => {
    out += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  // biome-ignore lint/suspicious/noExplicitAny: intercepting overloaded write — safe for tests.
  process.stderr.write = ((chunk: any) => {
    err += String(chunk);
    return true;
  }) as typeof process.stderr.write;
  try {
    run();
  } finally {
    process.stdout.write = originalOut;
    process.stderr.write = originalErr;
  }
  return { out, err };
}

const savedNoColor = process.env.NO_COLOR;
beforeEach(() => {
  process.env.NO_COLOR = '1';
});

describe('brix log', () => {
  test('info uses the idle face on stdout', () => {
    const { out, err } = withCapture(() => brix.info('booting'));
    expect(out).toContain(faceOf('idle'));
    expect(out).toContain('booting');
    expect(err).toBe('');
  });

  test('ok uses the happy face on stdout', () => {
    const { out } = withCapture(() => brix.ok('done'));
    expect(out).toContain(faceOf('happy'));
  });

  test('fail uses the error face on stderr', () => {
    const { out, err } = withCapture(() => brix.fail('boom'));
    expect(out).toBe('');
    expect(err).toContain(faceOf('error'));
    expect(err).toContain('boom');
  });

  test('panic writes the panic face to stderr', () => {
    const { err } = withCapture(() => brix.panic('runtime stalled'));
    expect(err).toContain(faceOf('panic'));
  });

  test('dead writes the dead face to stderr', () => {
    const { err } = withCapture(() => brix.dead('hub did not recover'));
    expect(err).toContain(faceOf('dead'));
  });

  test('NO_COLOR suppresses ANSI codes', () => {
    const { out } = withCapture(() => brix.ok('done'));
    // No ESC `[` color sequence around the face.
    expect(out.includes('\x1b[')).toBe(false);
  });

  if (savedNoColor !== undefined) {
    process.env.NO_COLOR = savedNoColor;
  }
});
