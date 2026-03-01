import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { BunMock } from '@brika/testing';
import { runVerifyForPackages } from '../verify-runner';
import type { WorkspacePackage } from '../workspace';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePkg(overrides: Partial<WorkspacePackage> = {}): WorkspacePackage {
  return {
    name: 'test-plugin',
    version: '1.0.0',
    path: '/workspace/plugins/test-plugin/package.json',
    relativePath: 'plugins/test-plugin/package.json',
    isPrivate: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// runVerifyForPackages — exercises runVerify, parseVerifyJsonPayload,
//                        readStringArray, and output-merging logic
// ---------------------------------------------------------------------------

describe('runVerifyForPackages', () => {
  let bun: BunMock;

  beforeEach(() => {
    bun = new BunMock();
  });

  afterEach(() => {
    bun.restore();
  });

  // ── Basic subprocess invocation (non-JSON mode) ─────────────────────────

  test('runs subprocess without --json flag when json is false', async () => {
    bun
      .spawn({
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
      })
      .apply();
    const pkgs = [
      makePkg(),
    ];
    const results = await runVerifyForPackages('/scripts/verify.ts', pkgs, '/workspace', false);

    expect(results).toHaveLength(1);
    expect(results[0].exitCode).toBe(0);
    expect(results[0].pkg).toBe(pkgs[0]);
    expect(results[0].payload).toBeUndefined();

    // Verify the spawn call did NOT include --json
    const call = bun.spawnCalls[0];
    expect(call.cmd).toEqual([
      'bun',
      '/scripts/verify.ts',
      '/workspace/plugins/test-plugin',
    ]);
    expect(call.cmd).not.toContain('--json');
  });

  test('runs subprocess with --json flag when json is true', async () => {
    const payload = JSON.stringify({
      errors: [],
      warnings: [],
    });
    bun
      .spawn({
        exitCode: 0,
        stdout: payload,
        stderr: '',
      })
      .apply();
    const pkgs = [
      makePkg(),
    ];
    const results = await runVerifyForPackages('/scripts/verify.ts', pkgs, '/workspace', true);

    expect(results).toHaveLength(1);
    const call = bun.spawnCalls[0];
    expect(call.cmd).toEqual([
      'bun',
      '/scripts/verify.ts',
      '/workspace/plugins/test-plugin',
      '--json',
    ]);
  });

  test('defaults json parameter to false when omitted', async () => {
    bun
      .spawn({
        exitCode: 0,
        stdout: '',
        stderr: '',
      })
      .apply();
    const pkgs = [
      makePkg(),
    ];
    const results = await runVerifyForPackages('/scripts/verify.ts', pkgs, '/workspace');

    expect(results).toHaveLength(1);
    expect(results[0].payload).toBeUndefined();
    expect(bun.spawnCalls[0].cmd).not.toContain('--json');
  });

  // ── Output merging logic ────────────────────────────────────────────────

  test('combines stdout and stderr into output', async () => {
    bun
      .spawn({
        exitCode: 0,
        stdout: 'stdout line',
        stderr: 'stderr line',
      })
      .apply();
    const results = await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/workspace',
      false
    );

    expect(results[0].output).toBe('stdout line\nstderr line');
  });

  test('output is just stdout when stderr is empty', async () => {
    bun
      .spawn({
        exitCode: 0,
        stdout: 'only stdout',
        stderr: '',
      })
      .apply();
    const results = await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/workspace',
      false
    );

    expect(results[0].output).toBe('only stdout');
  });

  test('output is just stderr when stdout is empty', async () => {
    bun
      .spawn({
        exitCode: 1,
        stdout: '',
        stderr: 'only stderr',
      })
      .apply();
    const results = await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/workspace',
      false
    );

    expect(results[0].output).toBe('only stderr');
  });

  test('output is empty string when both stdout and stderr are empty', async () => {
    bun
      .spawn({
        exitCode: 0,
        stdout: '',
        stderr: '',
      })
      .apply();
    const results = await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/workspace',
      false
    );

    expect(results[0].output).toBe('');
  });

  test('trims whitespace from stdout and stderr', async () => {
    bun
      .spawn({
        exitCode: 0,
        stdout: '  hello  ',
        stderr: '  world  ',
      })
      .apply();
    const results = await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/workspace',
      false
    );

    expect(results[0].output).toBe('hello\nworld');
  });

  // ── Non-zero exit code ──────────────────────────────────────────────────

  test('captures non-zero exit code from subprocess', async () => {
    bun
      .spawn({
        exitCode: 2,
        stdout: '',
        stderr: 'validation failed',
      })
      .apply();
    const results = await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/workspace',
      false
    );

    expect(results[0].exitCode).toBe(2);
    expect(results[0].output).toBe('validation failed');
  });

  // ── parseVerifyJsonPayload — valid payloads ─────────────────────────────

  test('parses valid JSON payload with errors and warnings', async () => {
    const payload = JSON.stringify({
      errors: [
        'missing field X',
      ],
      warnings: [
        'consider adding Y',
      ],
    });
    bun
      .spawn({
        exitCode: 1,
        stdout: payload,
        stderr: '',
      })
      .apply();
    const results = await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/workspace',
      true
    );

    expect(results[0].payload).toEqual({
      errors: [
        'missing field X',
      ],
      warnings: [
        'consider adding Y',
      ],
    });
  });

  test('parses payload with empty arrays', async () => {
    const payload = JSON.stringify({
      errors: [],
      warnings: [],
    });
    bun
      .spawn({
        exitCode: 0,
        stdout: payload,
        stderr: '',
      })
      .apply();
    const results = await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/workspace',
      true
    );

    expect(results[0].payload).toEqual({
      errors: [],
      warnings: [],
    });
  });

  test('parses payload with multiple errors and warnings', async () => {
    const payload = JSON.stringify({
      errors: [
        'err1',
        'err2',
        'err3',
      ],
      warnings: [
        'warn1',
        'warn2',
      ],
    });
    bun
      .spawn({
        exitCode: 1,
        stdout: payload,
        stderr: '',
      })
      .apply();
    const results = await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/workspace',
      true
    );

    expect(results[0].payload).toEqual({
      errors: [
        'err1',
        'err2',
        'err3',
      ],
      warnings: [
        'warn1',
        'warn2',
      ],
    });
  });

  // ── parseVerifyJsonPayload — invalid / edge cases ───────────────────────

  test('returns undefined payload when stdout is not valid JSON', async () => {
    bun
      .spawn({
        exitCode: 1,
        stdout: 'not json at all',
        stderr: '',
      })
      .apply();
    const results = await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/workspace',
      true
    );

    expect(results[0].payload).toBeUndefined();
  });

  test('returns undefined payload when stdout is empty (json mode)', async () => {
    bun
      .spawn({
        exitCode: 0,
        stdout: '',
        stderr: '',
      })
      .apply();
    const results = await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/workspace',
      true
    );

    expect(results[0].payload).toBeUndefined();
  });

  test('returns undefined payload when parsed JSON is a primitive', async () => {
    bun
      .spawn({
        exitCode: 0,
        stdout: '"just a string"',
        stderr: '',
      })
      .apply();
    const results = await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/workspace',
      true
    );

    expect(results[0].payload).toBeUndefined();
  });

  test('returns undefined payload when parsed JSON is null', async () => {
    bun
      .spawn({
        exitCode: 0,
        stdout: 'null',
        stderr: '',
      })
      .apply();
    const results = await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/workspace',
      true
    );

    expect(results[0].payload).toBeUndefined();
  });

  test('returns undefined payload when parsed JSON is an array', async () => {
    bun
      .spawn({
        exitCode: 0,
        stdout: '["a", "b"]',
        stderr: '',
      })
      .apply();
    const results = await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/workspace',
      true
    );

    // isObjectRecord returns true for arrays (typeof array === 'object')
    // but readStringArray(parsed.errors) will return undefined since
    // parsed.errors is undefined on the array object
    expect(results[0].payload).toBeUndefined();
  });

  test('returns undefined payload when errors field is missing', async () => {
    const payload = JSON.stringify({
      warnings: [
        'warn1',
      ],
    });
    bun
      .spawn({
        exitCode: 0,
        stdout: payload,
        stderr: '',
      })
      .apply();
    const results = await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/workspace',
      true
    );

    expect(results[0].payload).toBeUndefined();
  });

  test('returns undefined payload when warnings field is missing', async () => {
    const payload = JSON.stringify({
      errors: [
        'err1',
      ],
    });
    bun
      .spawn({
        exitCode: 0,
        stdout: payload,
        stderr: '',
      })
      .apply();
    const results = await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/workspace',
      true
    );

    expect(results[0].payload).toBeUndefined();
  });

  test('returns undefined payload when errors is not an array', async () => {
    const payload = JSON.stringify({
      errors: 'not-array',
      warnings: [],
    });
    bun
      .spawn({
        exitCode: 0,
        stdout: payload,
        stderr: '',
      })
      .apply();
    const results = await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/workspace',
      true
    );

    expect(results[0].payload).toBeUndefined();
  });

  test('returns undefined payload when warnings is not an array', async () => {
    const payload = JSON.stringify({
      errors: [],
      warnings: 42,
    });
    bun
      .spawn({
        exitCode: 0,
        stdout: payload,
        stderr: '',
      })
      .apply();
    const results = await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/workspace',
      true
    );

    expect(results[0].payload).toBeUndefined();
  });

  // ── readStringArray — filters non-string entries ────────────────────────

  test('readStringArray filters out non-string entries from errors', async () => {
    // The JSON has non-string values mixed in — readStringArray should keep only strings
    const payload = JSON.stringify({
      errors: [
        'real error',
        42,
        null,
        true,
        'another error',
      ],
      warnings: [
        'warn',
      ],
    });
    bun
      .spawn({
        exitCode: 1,
        stdout: payload,
        stderr: '',
      })
      .apply();
    const results = await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/workspace',
      true
    );

    expect(results[0].payload).toEqual({
      errors: [
        'real error',
        'another error',
      ],
      warnings: [
        'warn',
      ],
    });
  });

  test('readStringArray filters out non-string entries from warnings', async () => {
    const payload = JSON.stringify({
      errors: [
        'err',
      ],
      warnings: [
        123,
        'real warning',
        false,
        {},
        'second warning',
      ],
    });
    bun
      .spawn({
        exitCode: 1,
        stdout: payload,
        stderr: '',
      })
      .apply();
    const results = await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/workspace',
      true
    );

    expect(results[0].payload).toEqual({
      errors: [
        'err',
      ],
      warnings: [
        'real warning',
        'second warning',
      ],
    });
  });

  // ── Multiple packages ───────────────────────────────────────────────────

  test('runs verification for multiple packages in parallel', async () => {
    const payload = JSON.stringify({
      errors: [],
      warnings: [],
    });
    bun
      .spawn({
        exitCode: 0,
        stdout: payload,
        stderr: '',
      })
      .apply();

    const pkgs = [
      makePkg({
        name: 'plugin-a',
        path: '/workspace/plugins/plugin-a/package.json',
        relativePath: 'plugins/plugin-a/package.json',
      }),
      makePkg({
        name: 'plugin-b',
        path: '/workspace/plugins/plugin-b/package.json',
        relativePath: 'plugins/plugin-b/package.json',
      }),
    ];

    const results = await runVerifyForPackages('/scripts/verify.ts', pkgs, '/workspace', true);

    expect(results).toHaveLength(2);
    expect(results[0].pkg.name).toBe('plugin-a');
    expect(results[1].pkg.name).toBe('plugin-b');

    // Both should have been spawned
    expect(bun.spawnCalls).toHaveLength(2);
  });

  test('derives pluginDir from package path using dirname', async () => {
    bun
      .spawn({
        exitCode: 0,
        stdout: '',
        stderr: '',
      })
      .apply();
    const pkg = makePkg({
      path: '/workspace/deep/nested/plugins/my-plugin/package.json',
    });
    await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        pkg,
      ],
      '/workspace',
      false
    );

    expect(bun.spawnCalls[0].cmd).toEqual([
      'bun',
      '/scripts/verify.ts',
      '/workspace/deep/nested/plugins/my-plugin',
    ]);
  });

  test('returns empty array for empty packages list', async () => {
    bun
      .spawn({
        exitCode: 0,
        stdout: '',
        stderr: '',
      })
      .apply();
    const results = await runVerifyForPackages('/scripts/verify.ts', [], '/workspace', true);

    expect(results).toEqual([]);
    expect(bun.spawnCalls).toHaveLength(0);
  });

  // ── Passes cwd to subprocess ────────────────────────────────────────────

  test('passes cwd option to Bun.spawn', async () => {
    bun
      .spawn({
        exitCode: 0,
        stdout: '',
        stderr: '',
      })
      .apply();
    await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/my/custom/cwd',
      false
    );

    const call = bun.spawnCalls[0];
    const options = call.options as {
      cwd?: string;
    };
    expect(options.cwd).toBe('/my/custom/cwd');
  });

  // ── JSON mode does not produce payload when json=false ──────────────────

  test('does not parse JSON even if stdout is valid JSON when json is false', async () => {
    const payload = JSON.stringify({
      errors: [
        'err',
      ],
      warnings: [
        'warn',
      ],
    });
    bun
      .spawn({
        exitCode: 0,
        stdout: payload,
        stderr: '',
      })
      .apply();
    const results = await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/workspace',
      false
    );

    // payload should be undefined because json mode was not requested
    expect(results[0].payload).toBeUndefined();
    // But output should contain the raw JSON string
    expect(results[0].output).toBe(payload);
  });

  // ── Extra fields in JSON are ignored ────────────────────────────────────

  test('ignores extra fields in JSON payload and only keeps errors/warnings', async () => {
    const payload = JSON.stringify({
      errors: [
        'e1',
      ],
      warnings: [
        'w1',
      ],
      extraField: 'should be ignored',
      count: 42,
    });
    bun
      .spawn({
        exitCode: 0,
        stdout: payload,
        stderr: '',
      })
      .apply();
    const results = await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/workspace',
      true
    );

    expect(results[0].payload).toEqual({
      errors: [
        'e1',
      ],
      warnings: [
        'w1',
      ],
    });
  });

  // ── Truncated / malformed JSON ──────────────────────────────────────────

  test('returns undefined payload for truncated JSON', async () => {
    bun
      .spawn({
        exitCode: 1,
        stdout: '{"errors": ["e1"], "warnings":',
        stderr: '',
      })
      .apply();
    const results = await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/workspace',
      true
    );

    expect(results[0].payload).toBeUndefined();
  });

  // ── Numeric parsed JSON ─────────────────────────────────────────────────

  test('returns undefined payload when parsed JSON is a number', async () => {
    bun
      .spawn({
        exitCode: 0,
        stdout: '42',
        stderr: '',
      })
      .apply();
    const results = await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/workspace',
      true
    );

    expect(results[0].payload).toBeUndefined();
  });

  test('returns undefined payload when parsed JSON is boolean true', async () => {
    bun
      .spawn({
        exitCode: 0,
        stdout: 'true',
        stderr: '',
      })
      .apply();
    const results = await runVerifyForPackages(
      '/scripts/verify.ts',
      [
        makePkg(),
      ],
      '/workspace',
      true
    );

    expect(results[0].payload).toBeUndefined();
  });
});
