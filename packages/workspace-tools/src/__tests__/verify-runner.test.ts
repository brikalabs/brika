import { describe, expect, test } from 'bun:test';
import type { VerifyExecution, VerifyJsonPayload } from '../verify-runner';
import { getPreviewWarnings, normalizeWarningMessage } from '../verify-runner';

// ---------------------------------------------------------------------------
// normalizeWarningMessage
// ---------------------------------------------------------------------------

describe('normalizeWarningMessage', () => {
  test('collapses whitespace into single spaces', () => {
    expect(normalizeWarningMessage('some   extra   spaces')).toBe('some extra spaces');
  });

  test('replaces newlines and tabs with spaces', () => {
    expect(normalizeWarningMessage('line1\nline2\ttab\r\nend')).toBe('line1 line2 tab end');
  });

  test('trims leading and trailing whitespace', () => {
    expect(normalizeWarningMessage('  hello  ')).toBe('hello');
  });

  test('strips " Update ..." suffix', () => {
    expect(normalizeWarningMessage('missing field Update your package.json')).toBe('missing field');
  });

  test('does not strip "Update" when not preceded by a space', () => {
    expect(normalizeWarningMessage('Update needed')).toBe('Update needed');
  });

  test('normalizes "keywords must include brika" message', () => {
    const raw =
      'keywords must include "brika" so the plugin can be found by the npm registry search';
    expect(normalizeWarningMessage(raw)).toBe('keyword "brika" missing');
  });

  test('normalizes "keywords should include brika-plugin" message', () => {
    const raw = 'keywords should include "brika-plugin" for discoverability';
    expect(normalizeWarningMessage(raw)).toBe('keyword "brika-plugin" recommended');
  });

  test('normalizes "$schema field is missing" message', () => {
    expect(normalizeWarningMessage('$schema field is missing')).toBe('$schema missing');
  });

  test('normalizes "$schema host mismatch" message', () => {
    const raw = '$schema "https://example.com/schema" does not point to schema.brika.dev';
    expect(normalizeWarningMessage(raw)).toBe('$schema host must be schema.brika.dev');
  });

  test('returns compact string for unrecognised messages', () => {
    expect(normalizeWarningMessage('some other warning')).toBe('some other warning');
  });

  test('handles empty string', () => {
    expect(normalizeWarningMessage('')).toBe('');
  });

  test('handles message that is only whitespace', () => {
    expect(normalizeWarningMessage('   \t\n   ')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// getPreviewWarnings
// ---------------------------------------------------------------------------

function makeExecution(overrides: Partial<VerifyExecution>): VerifyExecution {
  return {
    pkg: {
      name: 'test-pkg',
      version: '1.0.0',
      path: '/tmp/test-pkg/package.json',
      relativePath: 'plugins/test-pkg/package.json',
      isPrivate: false,
    },
    exitCode: 0,
    output: '',
    ...overrides,
  };
}

describe('getPreviewWarnings', () => {
  test('returns normalized errors and warnings when payload is present', () => {
    const payload: VerifyJsonPayload = {
      errors: ['keywords must include "brika" so the plugin can be found'],
      warnings: ['$schema field is missing'],
    };
    const result = makeExecution({
      payload,
    });
    const warnings = getPreviewWarnings(result);
    expect(warnings).toEqual(['keyword "brika" missing', '$schema missing']);
  });

  test('returns empty array when payload has no errors or warnings', () => {
    const payload: VerifyJsonPayload = {
      errors: [],
      warnings: [],
    };
    const result = makeExecution({
      payload,
    });
    const warnings = getPreviewWarnings(result);
    expect(warnings).toEqual([]);
  });

  test('returns fallback message when no payload and exit code is non-zero', () => {
    const result = makeExecution({
      exitCode: 1,
      output: 'raw output here',
    });
    const warnings = getPreviewWarnings(result);
    expect(warnings).toEqual(['plugin verification failed (could not parse output)']);
  });

  test('returns undefined when no payload and exit code is zero', () => {
    const result = makeExecution({
      exitCode: 0,
    });
    const warnings = getPreviewWarnings(result);
    expect(warnings).toBeUndefined();
  });

  test('prefers payload over exit code when both are present', () => {
    const payload: VerifyJsonPayload = {
      errors: ['some error'],
      warnings: [],
    };
    const result = makeExecution({
      exitCode: 1,
      payload,
    });
    const warnings = getPreviewWarnings(result);
    expect(warnings).toEqual(['some error']);
  });
});
