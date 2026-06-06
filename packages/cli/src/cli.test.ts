/**
 * Option values reach handlers under camelCase keys, so a `--no-boot`
 * flag is read as `values.noBoot` rather than the bracket-only
 * `values['no-boot']`. The flag name itself stays hyphenated.
 */

import { describe, expect, test } from 'bun:test';
import { createCli } from './cli';
import { defineCommand } from './command';

/** Run `probe` with the given argv and return the values its handler saw. */
async function captureValues(
  options: Parameters<typeof defineCommand>[0]['options'],
  argv: string[]
): Promise<Record<string, unknown>> {
  let captured: Record<string, unknown> = {};
  const cli = createCli({ name: 'test' }).addCommand(
    defineCommand({
      name: 'probe',
      description: 'capture parsed option values',
      options,
      handler(args) {
        captured = args.values;
      },
    })
  );
  await cli.run(['probe', ...argv]);
  return captured;
}

describe('createCli option values', () => {
  test('exposes kebab-case flags under camelCase keys', async () => {
    const values = await captureValues(
      {
        'no-boot': { type: 'boolean', default: false },
        'no-exit-code': { type: 'boolean', default: false },
        force: { type: 'boolean', default: false },
      },
      ['--no-boot', '--no-exit-code', '--force']
    );

    expect(values.noBoot).toBe(true);
    expect(values.noExitCode).toBe(true);
    expect(values.force).toBe(true);
    // The original hyphenated keys are re-keyed away, not duplicated.
    expect(values['no-boot']).toBeUndefined();
    expect(values['no-exit-code']).toBeUndefined();
  });

  test('applies the default under the camelCase key when the flag is absent', async () => {
    const values = await captureValues({ 'no-boot': { type: 'boolean', default: false } }, []);
    expect(values.noBoot).toBe(false);
  });

  test('passes a string flag value through under its camelCase key', async () => {
    const values = await captureValues({ 'config-path': { type: 'string' } }, [
      '--config-path',
      '/tmp/x.yml',
    ]);
    expect(values.configPath).toBe('/tmp/x.yml');
  });
});
