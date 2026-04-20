import { describe, expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import type { ValidationIssue } from '../types';
import { emptyIssuesTitle, fixLabel, IssueRow, IssuesContent, issueLabel } from './issues-tab';

// ─── Pure functions ────────────────────────────────────────────────────────

describe('emptyIssuesTitle', () => {
  test('returns matching message when filter is set', () => {
    expect(emptyIssuesTitle('hello', 'all')).toBe('No matching issues');
  });

  test('returns severity-specific message for error filter', () => {
    expect(emptyIssuesTitle('', 'error')).toBe('No errors found');
  });

  test('returns severity-specific message for warning filter', () => {
    expect(emptyIssuesTitle('', 'warning')).toBe('No warnings found');
  });

  test('returns all-OK message for "all" with no filter', () => {
    expect(emptyIssuesTitle('', 'all')).toBe('All translations in sync');
  });
});

describe('issueLabel', () => {
  test('returns type with hyphens replaced by spaces', () => {
    const issue: ValidationIssue = {
      type: 'missing-key',
      severity: 'error',
      namespace: 'ns',
      locale: 'fr',
      referenceLocale: 'en',
    };
    expect(issueLabel(issue)).toBe('missing key');
  });

  test('returns extra key label', () => {
    const issue: ValidationIssue = {
      type: 'extra-key',
      severity: 'warning',
      namespace: 'ns',
      locale: 'fr',
      referenceLocale: 'en',
    };
    expect(issueLabel(issue)).toBe('extra key');
  });

  test('returns missing variable template with single variable', () => {
    const issue: ValidationIssue = {
      type: 'missing-variable',
      severity: 'error',
      namespace: 'ns',
      locale: 'fr',
      referenceLocale: 'en',
      variables: ['name'],
    };
    expect(issueLabel(issue)).toBe('missing {{name}}');
  });

  test('returns missing variable template with multiple variables', () => {
    const issue: ValidationIssue = {
      type: 'missing-variable',
      severity: 'error',
      namespace: 'ns',
      locale: 'fr',
      referenceLocale: 'en',
      variables: ['name', 'count'],
    };
    expect(issueLabel(issue)).toBe('missing {{name}}, {{count}}');
  });

  test('falls back to type label when missing-variable has no variables', () => {
    const issue: ValidationIssue = {
      type: 'missing-variable',
      severity: 'error',
      namespace: 'ns',
      locale: 'fr',
      referenceLocale: 'en',
    };
    expect(issueLabel(issue)).toBe('missing variable');
  });
});

describe('fixLabel', () => {
  test('returns "Copy ref" for missing-key', () => {
    const issue: ValidationIssue = {
      type: 'missing-key',
      severity: 'error',
      namespace: 'ns',
      locale: 'fr',
      referenceLocale: 'en',
    };
    expect(fixLabel(issue)).toBe('Copy ref');
  });

  test('returns "Remove" for extra-key', () => {
    const issue: ValidationIssue = {
      type: 'extra-key',
      severity: 'warning',
      namespace: 'ns',
      locale: 'fr',
      referenceLocale: 'en',
    };
    expect(fixLabel(issue)).toBe('Remove');
  });

  test('returns "Copy ref" for missing-variable', () => {
    const issue: ValidationIssue = {
      type: 'missing-variable',
      severity: 'error',
      namespace: 'ns',
      locale: 'fr',
      referenceLocale: 'en',
    };
    expect(fixLabel(issue)).toBe('Copy ref');
  });

  test('returns null for missing-namespace', () => {
    const issue: ValidationIssue = {
      type: 'missing-namespace',
      severity: 'error',
      namespace: 'ns',
      locale: 'fr',
      referenceLocale: 'en',
    };
    expect(fixLabel(issue)).toBeNull();
  });
});

// ─── IssueRow ──────────────────────────────────────────────────────────────

describe('IssueRow', () => {
  test('renders error issue with red border', () => {
    const issue: ValidationIssue = {
      type: 'missing-key',
      severity: 'error',
      namespace: 'common',
      locale: 'fr',
      key: 'hello',
      referenceLocale: 'en',
    };
    const html = renderToString(<IssueRow issue={issue} />);
    expect(html).toContain('red');
    expect(html).toContain('hello');
    expect(html).toContain('fr');
  });

  test('renders warning issue with amber border', () => {
    const issue: ValidationIssue = {
      type: 'extra-key',
      severity: 'warning',
      namespace: 'common',
      locale: 'fr',
      key: 'old',
      referenceLocale: 'en',
    };
    const html = renderToString(<IssueRow issue={issue} />);
    expect(html).toContain('amber');
    expect(html).toContain('old');
  });

  test('renders fix button when onFix provided', () => {
    const issue: ValidationIssue = {
      type: 'extra-key',
      severity: 'warning',
      namespace: 'common',
      locale: 'fr',
      key: 'old',
      referenceLocale: 'en',
    };
    const html = renderToString(<IssueRow issue={issue} onFix={() => {}} />);
    expect(html).toContain('Remove');
    expect(html).toContain('svg');
  });

  test('does not render fix button when no onFix', () => {
    const issue: ValidationIssue = {
      type: 'extra-key',
      severity: 'warning',
      namespace: 'common',
      locale: 'fr',
      key: 'old',
      referenceLocale: 'en',
    };
    const html = renderToString(<IssueRow issue={issue} />);
    expect(html).not.toContain('Remove');
  });

  test('renders issue without key', () => {
    const issue: ValidationIssue = {
      type: 'missing-namespace',
      severity: 'error',
      namespace: 'auth',
      locale: 'fr',
      referenceLocale: 'en',
    };
    const html = renderToString(<IssueRow issue={issue} />);
    expect(html).toContain('missing namespace');
    expect(html).toContain('fr');
  });
});

// ─── IssuesContent ─────────────────────────────────────────────────────────

const sampleIssues: ValidationIssue[] = [
  {
    type: 'missing-key',
    severity: 'error',
    namespace: 'common',
    locale: 'fr',
    key: 'bye',
    referenceLocale: 'en',
  },
  {
    type: 'extra-key',
    severity: 'warning',
    namespace: 'common',
    locale: 'fr',
    key: 'extra',
    referenceLocale: 'en',
  },
  {
    type: 'missing-variable',
    severity: 'error',
    namespace: 'auth',
    locale: 'fr',
    key: 'greeting',
    referenceLocale: 'en',
    variables: ['name', 'app'],
  },
];

describe('IssuesContent', () => {
  test('renders empty state with no issues', () => {
    const html = renderToString(<IssuesContent issues={[]} filter="" />);
    expect(html).toContain('All translations in sync');
  });

  test('renders issues grouped by namespace', () => {
    const html = renderToString(<IssuesContent issues={sampleIssues} filter="" />);
    expect(html).toContain('common');
    expect(html).toContain('auth');
  });

  test('renders error and warning counts', () => {
    const html = renderToString(<IssuesContent issues={sampleIssues} filter="" />);
    expect(html).toContain('All');
    expect(html).toContain('3');
    expect(html).toContain('Errors');
    expect(html).toContain('2');
    expect(html).toContain('Warnings');
    expect(html).toContain('1');
  });

  test('renders issue keys', () => {
    const html = renderToString(<IssuesContent issues={sampleIssues} filter="" />);
    expect(html).toContain('bye');
    expect(html).toContain('extra');
    expect(html).toContain('greeting');
  });

  test('renders missing variable names', () => {
    const html = renderToString(<IssuesContent issues={sampleIssues} filter="" />);
    expect(html).toContain('name');
    expect(html).toContain('app');
  });

  test('renders locale badges', () => {
    const html = renderToString(<IssuesContent issues={sampleIssues} filter="" />);
    expect(html).toContain('fr');
  });

  test('renders error severity styling', () => {
    const html = renderToString(<IssuesContent issues={sampleIssues} filter="" />);
    expect(html).toContain('red');
  });

  test('renders warning severity styling', () => {
    const html = renderToString(<IssuesContent issues={sampleIssues} filter="" />);
    expect(html).toContain('amber');
  });

  test('renders empty state with filter', () => {
    const html = renderToString(<IssuesContent issues={sampleIssues} filter="zzz_no_match" />);
    expect(html).toContain('No matching issues');
  });

  test('filters issues by key', () => {
    const html = renderToString(<IssuesContent issues={sampleIssues} filter="bye" />);
    expect(html).toContain('bye');
    expect(html).not.toContain('greeting');
  });

  test('renders with only errors', () => {
    const errorsOnly: ValidationIssue[] = [
      {
        type: 'missing-key',
        severity: 'error',
        namespace: 'ns',
        locale: 'fr',
        key: 'k',
        referenceLocale: 'en',
      },
    ];
    const html = renderToString(<IssuesContent issues={errorsOnly} filter="" />);
    expect(html).toContain('missing key');
  });

  test('renders fix button for extra-key', () => {
    const extraOnly: ValidationIssue[] = [
      {
        type: 'extra-key',
        severity: 'warning',
        namespace: 'ns',
        locale: 'fr',
        key: 'k',
        referenceLocale: 'en',
      },
    ];
    const html = renderToString(<IssuesContent issues={extraOnly} filter="" />);
    expect(html).toContain('Remove');
  });
});
