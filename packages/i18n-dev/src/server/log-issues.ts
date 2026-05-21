import type { Logger } from 'vite';
import type { ValidationIssue } from '../types';

const SAMPLE_LIMIT = 10;

interface GroupedIssues {
  readonly type: ValidationIssue['type'];
  readonly severity: ValidationIssue['severity'];
  readonly issues: ValidationIssue[];
}

function groupByTypeAndSeverity(issues: ValidationIssue[]): GroupedIssues[] {
  const groups = new Map<string, GroupedIssues>();
  for (const issue of issues) {
    const key = `${issue.severity}\0${issue.type}`;
    const existing = groups.get(key);
    if (existing) {
      existing.issues.push(issue);
    } else {
      groups.set(key, { type: issue.type, severity: issue.severity, issues: [issue] });
    }
  }
  // Errors before warnings; alphabetical within each severity.
  return [...groups.values()].sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'error' ? -1 : 1;
    }
    return a.type.localeCompare(b.type);
  });
}

function formatIssueLine(issue: ValidationIssue): string {
  const qualified = issue.key ? `${issue.namespace}:${issue.key}` : issue.namespace;
  if (issue.type === 'missing-variable' && issue.variables?.length) {
    return `${qualified} (${issue.locale}, missing {{${issue.variables.join('}}, {{')}}})`;
  }
  if (issue.type === 'missing-key' || issue.type === 'missing-namespace') {
    return `${qualified} (${issue.locale})`;
  }
  return qualified;
}

/**
 * Print a per-type breakdown of validation issues to the Vite logger.
 *
 *   - Errors first, warnings after; alphabetical within each tier.
 *   - First `SAMPLE_LIMIT` keys per group are listed; the rest are
 *     summarised as `(+N more)`.
 *   - When zero issues, logs the green "All translations OK" line so the
 *     terminal still tells the user the scan ran.
 */
export function logIssueReport(logger: Logger, issues: ValidationIssue[]): void {
  if (issues.length === 0) {
    logger.info('[i18n-dev] All translations OK', { timestamp: true });
    return;
  }

  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const lines = [`[i18n-dev] ${errors} error(s), ${warnings} warning(s)`];

  for (const group of groupByTypeAndSeverity(issues)) {
    lines.push(`  ${group.severity.toUpperCase()} ${group.type} (${group.issues.length}):`);
    for (const issue of group.issues.slice(0, SAMPLE_LIMIT)) {
      lines.push(`    ${formatIssueLine(issue)}`);
    }
    if (group.issues.length > SAMPLE_LIMIT) {
      lines.push(`    … +${group.issues.length - SAMPLE_LIMIT} more`);
    }
  }

  logger.warn(lines.join('\n'), { timestamp: true });
}
