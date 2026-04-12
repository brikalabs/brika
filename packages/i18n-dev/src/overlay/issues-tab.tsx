import { AlertTriangle, CheckCircle2, Wand2, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ValidationIssue } from '../types';
import { useToggleSet } from './hooks';
import { CopyButton, EmptyState, FilterPill, NamespaceGroup, groupBy } from './primitives';
import { buildFix, fixAllIssues, fixIssue } from './store';

export function emptyIssuesTitle(filter: string, severity: string): string {
  if (filter) {
    return 'No matching issues';
  }
  if (severity !== 'all') {
    return `No ${severity}s found`;
  }
  return 'All translations in sync';
}

export function issueLabel(issue: ValidationIssue): string {
  if (issue.type === 'missing-variable' && issue.variables) {
    return `missing {{${issue.variables.join('}}, {{')}}}`;
  }
  return issue.type.replaceAll('-', ' ');
}

export function fixLabel(issue: ValidationIssue): string | null {
  switch (issue.type) {
    case 'missing-key':
      return 'Copy ref';
    case 'extra-key':
      return 'Remove';
    case 'missing-variable':
      return 'Copy ref';
    default:
      return null;
  }
}

export function IssueRow({ issue, onFix }: Readonly<{ issue: ValidationIssue; onFix?: () => void }>) {
  const isError = issue.severity === 'error';
  return (
    <div
      className={`flex items-start gap-2 rounded-md border-l-2 py-1.5 pr-2 pl-3 text-[11px] transition-colors hover:bg-dt-bg-hover ${
        isError ? 'border-l-red-500/70' : 'border-l-amber-500/70'
      }`}
    >
      {isError ? (
        <XCircle className="mt-px size-3 shrink-0 text-red-400" />
      ) : (
        <AlertTriangle className="mt-px size-3 shrink-0 text-amber-400" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`font-medium ${isError ? 'text-red-400' : 'text-amber-400'}`}>
            {issueLabel(issue)}
          </span>
          <span className="rounded bg-dt-bg-badge px-1 py-px text-[9px] text-dt-text-3">
            {issue.locale}
          </span>
          {onFix && (
            <button
              type="button"
              onClick={onFix}
              className="ml-auto flex shrink-0 cursor-pointer items-center gap-0.5 rounded border-none bg-indigo-500/15 px-1.5 py-px font-medium text-[9px] text-indigo-400 transition-colors hover:bg-indigo-500/25"
            >
              <Wand2 className="size-2.5" />
              {fixLabel(issue)}
            </button>
          )}
        </div>
        {issue.key && (
          <div className="mt-0.5 flex items-center gap-1">
            <span className="truncate font-mono text-dt-text-3">{issue.key}</span>
            <CopyButton text={`${issue.namespace}:${issue.key}`} />
          </div>
        )}
      </div>
    </div>
  );
}

export function IssuesContent({ issues, filter }: Readonly<{ issues: ValidationIssue[]; filter: string }>) {
  const { set: collapsed, toggle } = useToggleSet();
  const [severity, setSeverity] = useState<'all' | 'error' | 'warning'>('all');

  const { errorCount, warningCount } = useMemo(() => {
    let e = 0;
    let w = 0;
    for (const i of issues) {
      if (i.severity === 'error') e++;
      else w++;
    }
    return { errorCount: e, warningCount: w };
  }, [issues]);

  const filtered = useMemo(() => {
    let result = issues;
    if (severity !== 'all') {
      result = result.filter((i) => i.severity === severity);
    }
    if (filter) {
      const q = filter.toLowerCase();
      result = result.filter(
        (i) => i.namespace.toLowerCase().includes(q) || (i.key?.toLowerCase().includes(q) ?? false)
      );
    }
    return result;
  }, [issues, filter, severity]);

  const grouped = useMemo(() => groupBy(filtered, (i) => i.namespace), [filtered]);

  const fixableCount = useMemo(
    () => filtered.filter((i) => buildFix(i) !== null).length,
    [filtered]
  );

  return (
    <>
      <div className="mb-3 flex items-center gap-1.5">
        <FilterPill active={severity === 'all'} onClick={() => setSeverity('all')}>
          All ({issues.length})
        </FilterPill>
        <FilterPill
          active={severity === 'error'}
          onClick={() => setSeverity('error')}
          variant="error"
        >
          Errors ({errorCount})
        </FilterPill>
        <FilterPill
          active={severity === 'warning'}
          onClick={() => setSeverity('warning')}
          variant="warning"
        >
          Warnings ({warningCount})
        </FilterPill>
        {fixableCount > 0 && (
          <button
            type="button"
            onClick={() => fixAllIssues(filtered)}
            className="ml-auto flex cursor-pointer items-center gap-1 rounded-full border-none bg-indigo-500/15 px-2.5 py-0.5 font-medium text-[10px] text-indigo-400 transition-colors hover:bg-indigo-500/25"
          >
            <Wand2 className="size-3" />
            Fix all ({fixableCount})
          </button>
        )}
      </div>

      {grouped.length === 0 ? (
        <EmptyState
          icon={
            filter || severity !== 'all' ? undefined : (
              <CheckCircle2 className="size-8 text-emerald-500/60" />
            )
          }
          title={emptyIssuesTitle(filter, severity)}
          description={
            filter || severity !== 'all'
              ? undefined
              : 'All translation keys are properly defined across locales.'
          }
        />
      ) : (
        grouped.map(([ns, nsIssues]) => (
          <NamespaceGroup
            key={ns}
            ns={ns}
            count={nsIssues.length}
            isCollapsed={collapsed.has(ns)}
            onToggle={() => toggle(ns)}
          >
            {nsIssues.map((issue, i) => {
              const fix = buildFix(issue);
              return (
                <IssueRow
                  key={`${issue.key}-${issue.locale}-${i}`}
                  issue={issue}
                  onFix={fix ? () => fixIssue(issue) : undefined}
                />
              );
            })}
          </NamespaceGroup>
        ))
      )}
    </>
  );
}
