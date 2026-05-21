import { describe, expect, test } from 'bun:test';
import type { Logger } from 'vite';
import type { ValidationIssue } from '../../types';
import { logIssueReport } from '../log-issues';

interface LoggedCall {
  readonly level: 'info' | 'warn' | 'error';
  readonly msg: string;
}

function createLogger(): { logger: Logger; calls: LoggedCall[] } {
  const calls: LoggedCall[] = [];
  const logger = {
    info: (msg: string) => {
      calls.push({ level: 'info', msg });
    },
    warn: (msg: string) => {
      calls.push({ level: 'warn', msg });
    },
    warnOnce: (msg: string) => {
      calls.push({ level: 'warn', msg });
    },
    error: (msg: string) => {
      calls.push({ level: 'error', msg });
    },
    clearScreen: () => undefined,
    hasErrorLogged: () => false,
    hasWarned: false,
  } satisfies Logger;
  return { logger, calls };
}

function makeIssue(overrides: Partial<ValidationIssue>): ValidationIssue {
  return {
    type: 'missing-key',
    severity: 'error',
    namespace: 'common',
    locale: 'fr',
    key: 'hello',
    referenceLocale: 'en',
    ...overrides,
  };
}

describe('logIssueReport', () => {
  test('reports clean status with info-level when there are no issues', () => {
    const { logger, calls } = createLogger();
    logIssueReport(logger, []);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.level).toBe('info');
    expect(calls[0]?.msg).toBe('[i18n-dev] All translations OK');
  });

  test('emits a single warn line summarising error and warning counts', () => {
    const { logger, calls } = createLogger();
    logIssueReport(logger, [
      makeIssue({ severity: 'error', key: 'a' }),
      makeIssue({ severity: 'error', key: 'b' }),
      makeIssue({ severity: 'warning', type: 'dead-key', key: 'c' }),
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.level).toBe('warn');
    expect(calls[0]?.msg).toContain('[i18n-dev] 2 error(s), 1 warning(s)');
  });

  test('orders errors before warnings and sorts by type alphabetically inside each tier', () => {
    const { logger, calls } = createLogger();
    logIssueReport(logger, [
      makeIssue({ severity: 'warning', type: 'dead-key', key: 'z' }),
      makeIssue({ severity: 'error', type: 'unknown-key', key: 'a' }),
      makeIssue({ severity: 'error', type: 'missing-key', key: 'b' }),
    ]);
    const body = calls[0]?.msg ?? '';
    const missingIdx = body.indexOf('ERROR missing-key');
    const unknownIdx = body.indexOf('ERROR unknown-key');
    const deadIdx = body.indexOf('WARNING dead-key');
    expect(missingIdx).toBeGreaterThan(-1);
    expect(unknownIdx).toBeGreaterThan(-1);
    expect(deadIdx).toBeGreaterThan(-1);
    expect(missingIdx).toBeLessThan(unknownIdx);
    expect(unknownIdx).toBeLessThan(deadIdx);
  });

  test('formats missing-variable issues with their variable list', () => {
    const { logger, calls } = createLogger();
    logIssueReport(logger, [
      makeIssue({
        type: 'missing-variable',
        severity: 'warning',
        key: 'greeting',
        variables: ['name', 'count'],
      }),
    ]);
    expect(calls[0]?.msg).toContain('common:greeting (fr, missing {{name}}, {{count}})');
  });

  test('formats missing-key / missing-namespace with the locale suffix', () => {
    const { logger, calls } = createLogger();
    logIssueReport(logger, [
      makeIssue({ type: 'missing-key', key: 'a.b.c' }),
      makeIssue({ type: 'missing-namespace', key: undefined, namespace: 'admin' }),
    ]);
    const body = calls[0]?.msg ?? '';
    expect(body).toContain('common:a.b.c (fr)');
    expect(body).toContain('admin (fr)');
  });

  test('falls back to namespace-only display for issues with no key', () => {
    const { logger, calls } = createLogger();
    logIssueReport(logger, [
      makeIssue({ type: 'plugin-error', key: undefined, namespace: 'scanner' }),
    ]);
    const body = calls[0]?.msg ?? '';
    const sampleLine = body.split('\n').at(-1) ?? '';
    expect(sampleLine.trim()).toBe('scanner');
  });

  test('caps each group at 10 samples and appends a "+N more" line', () => {
    const issues: ValidationIssue[] = [];
    for (let i = 0; i < 13; i++) {
      issues.push(makeIssue({ key: `k${i}` }));
    }
    const { logger, calls } = createLogger();
    logIssueReport(logger, issues);
    const body = calls[0]?.msg ?? '';
    expect(body).toContain('common:k0 (fr)');
    expect(body).toContain('common:k9 (fr)');
    expect(body).not.toContain('common:k10 (fr)');
    expect(body).toContain('… +3 more');
  });

  test('does not append the "+N more" line at exactly the sample limit', () => {
    const issues: ValidationIssue[] = [];
    for (let i = 0; i < 10; i++) {
      issues.push(makeIssue({ key: `k${i}` }));
    }
    const { logger, calls } = createLogger();
    logIssueReport(logger, issues);
    const body = calls[0]?.msg ?? '';
    expect(body).toContain('common:k9 (fr)');
    expect(body).not.toContain('more');
  });

  test('groups by severity+type pair (same type, different severity, stays in distinct groups)', () => {
    const { logger, calls } = createLogger();
    logIssueReport(logger, [
      makeIssue({ severity: 'error', type: 'missing-key', key: 'a' }),
      makeIssue({ severity: 'warning', type: 'missing-key', key: 'b' }),
    ]);
    const body = calls[0]?.msg ?? '';
    expect(body).toContain('ERROR missing-key (1)');
    expect(body).toContain('WARNING missing-key (1)');
  });
});
