/**
 * Coverage report — project-level overview + per-file table of files
 * under a configurable threshold. Supports both `overall` and `new`
 * (PR / new-code period) scopes.
 */

import { api, type ComponentTree, PROJECT_KEY, type ProjectMeasures, prParam } from './api';
import { c, heading, info, success } from './cli';

interface CoverageFile {
  path: string;
  cov: number;
  lines: number;
  uncov: number;
}

/** Print the project-level coverage overview. */
function printCoverageOverview(measures: ProjectMeasures): void {
  const metric = (key: string) =>
    measures.component.measures.find((m) => m.metric === key)?.value ?? '—';

  heading('Coverage Overview');
  console.log(
    `  ${c.bold}Overall:${c.reset}      ${metric('coverage')}%  (${metric('uncovered_lines')} / ${metric('lines_to_cover')} uncovered)`
  );
  console.log(
    `  ${c.bold}New code:${c.reset}     ${metric('new_coverage')}%  (${metric('new_uncovered_lines')} / ${metric('new_lines_to_cover')} uncovered)`
  );
  console.log();
}

/** Extract and filter files under the coverage threshold from the component tree. */
function extractFilesUnderThreshold(
  tree: ComponentTree,
  isNew: boolean,
  threshold: number
): CoverageFile[] {
  return tree.components
    .map((comp) => {
      const getValue = (key: string) => {
        const m = comp.measures.find((x) => x.metric === key);
        return isNew ? m?.periods?.[0]?.value : m?.value;
      };
      const cov = Number.parseFloat(getValue(isNew ? 'new_coverage' : 'coverage') ?? '-1');
      const lines = Number.parseInt(
        getValue(isNew ? 'new_lines_to_cover' : 'lines_to_cover') ?? '0'
      );
      const uncov = Number.parseInt(
        getValue(isNew ? 'new_uncovered_lines' : 'uncovered_lines') ?? '0'
      );
      return { path: comp.path, cov, lines, uncov };
    })
    .filter((f) => f.lines > 0 && f.cov < threshold)
    .toSorted((a, b) => b.uncov - a.uncov);
}

/** Pick the ANSI colour code for a coverage percentage. */
function coverageColor(cov: number, threshold: number): string {
  if (cov < 0) {
    return c.dim;
  }
  if (cov === 0) {
    return c.red;
  }
  if (cov < threshold / 2) {
    return c.yellow;
  }
  return c.blue;
}

/** Print per-file coverage rows and return totals. */
function printCoverageFiles(
  files: CoverageFile[],
  threshold: number
): { totalLines: number; totalUncov: number } {
  let totalLines = 0;
  let totalUncov = 0;
  for (const f of files) {
    const covStr = f.cov < 0 ? '  —  ' : `${f.cov.toFixed(1).padStart(5)}%`;
    const bar = coverageColor(f.cov, threshold);
    console.log(
      `  ${bar}${covStr}${c.reset}  ${c.dim}(${String(f.uncov).padStart(3)} uncov / ${f.lines})${c.reset}  ${f.path}`
    );
    totalLines += f.lines;
    totalUncov += f.uncov;
  }
  return { totalLines, totalUncov };
}

export async function cmdCoverage(flags: Record<string, string>): Promise<void> {
  const threshold = Number.parseFloat(flags.threshold ?? '80');
  const isNew = flags.scope !== 'overall';
  const limit = Number.parseInt(flags.limit ?? '100');

  // Fetch project-level metrics
  const proj = await api<ProjectMeasures>('/api/measures/component', {
    component: PROJECT_KEY,
    metricKeys:
      'coverage,new_coverage,new_lines_to_cover,new_uncovered_lines,lines_to_cover,uncovered_lines',
    ...prParam(),
  });

  printCoverageOverview(proj);

  // Fetch per-file breakdown
  const metricKeys = isNew
    ? 'new_coverage,new_lines_to_cover,new_uncovered_lines'
    : 'coverage,lines_to_cover,uncovered_lines';

  const tree = await api<ComponentTree>('/api/measures/component_tree', {
    component: PROJECT_KEY,
    metricKeys,
    strategy: 'leaves',
    ps: String(limit),
    s: isNew ? 'metricPeriod' : 'metric',
    asc: 'true',
    metricSort: isNew ? 'new_coverage' : 'coverage',
    ...(isNew ? { metricPeriodSort: '1' } : {}),
    qualifiers: 'FIL',
    ...prParam(),
  });

  const files = extractFilesUnderThreshold(tree, isNew, threshold);

  const scope = isNew ? 'New code' : 'Overall';
  heading(`${scope} files under ${threshold}% — ${files.length} files`);

  if (files.length === 0) {
    success(`All files meet the ${threshold}% threshold!`);
    return;
  }

  const { totalLines, totalUncov } = printCoverageFiles(files, threshold);

  console.log();
  const covered = totalLines - totalUncov;
  const totalPct = totalLines > 0 ? ((covered / totalLines) * 100).toFixed(1) : '0';
  info(`Total: ${totalUncov} uncovered / ${totalLines} lines (${totalPct}% covered)`);

  if (isNew) {
    const needed = Math.ceil(totalLines * (threshold / 100)) - covered;
    if (needed > 0) {
      info(`Need to cover ${c.bold}${needed}${c.reset}${c.dim} more lines to reach ${threshold}%`);
    }
  }
  console.log();
}
