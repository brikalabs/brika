/**
 * Issue and hotspot commands: list, summary, single-key transitions
 * (false-positive / wontfix / reopen / hotspot-safe), bulk variants.
 *
 * Coverage commands live in `./coverage.ts`.
 */

import {
  api,
  apiPost,
  type HotspotSearchResult,
  type IssueSearchResult,
  PROJECT_KEY,
  prParam,
} from './api';
import { c, heading, info, probBadge, severityBadge, shortPath, success, typeBadge } from './cli';

export async function cmdList(flags: Record<string, string>): Promise<void> {
  const params: Record<string, string> = {
    componentKeys: PROJECT_KEY,
    statuses: 'OPEN',
    ps: flags.limit ?? '100',
    s: 'SEVERITY',
    asc: 'false',
    ...prParam(),
  };
  if (flags.type) {
    params.types = flags.type;
  }
  if (flags.severity) {
    params.severities = flags.severity;
  }
  if (flags.rule) {
    params.rules = flags.rule;
  }

  const data = await api<IssueSearchResult>('/api/issues/search', params);
  const shown = data.issues.length;
  const total = data.total;

  heading(`Open Issues — ${total} total${shown < total ? ` (showing ${shown})` : ''}`);

  if (data.issues.length === 0) {
    success('No issues found!');
    return;
  }

  for (const issue of data.issues) {
    const file = shortPath(issue.component, PROJECT_KEY);
    const loc = issue.line ? `:${issue.line}` : '';
    console.log(
      `  ${typeBadge(issue.type)} ${severityBadge(issue.severity)}  ${c.cyan}${file}${loc}${c.reset}`
    );
    console.log(`  ${' '.repeat(16)}  ${issue.message} ${c.dim}(${issue.rule})${c.reset}`);
    console.log(`  ${' '.repeat(16)}  ${c.dim}key: ${issue.key}${c.reset}`);
    console.log();
  }

  if (shown < total) {
    info(`Showing ${shown} of ${total}. Use --limit <n> to see more.`);
  }
}

export async function cmdHotspots(flags: Record<string, string>): Promise<void> {
  const data = await api<HotspotSearchResult>('/api/hotspots/search', {
    projectKey: PROJECT_KEY,
    status: 'TO_REVIEW',
    ps: flags.limit ?? '50',
    ...prParam(),
  });

  const shown = data.hotspots.length;
  const total = data.paging.total;

  heading(`Security Hotspots — ${total} to review${shown < total ? ` (showing ${shown})` : ''}`);

  if (data.hotspots.length === 0) {
    success('No hotspots to review!');
    return;
  }

  for (const h of data.hotspots) {
    const file = shortPath(h.component, PROJECT_KEY);
    const loc = h.line ? `:${h.line}` : '';
    console.log(`  ${probBadge(h.vulnerabilityProbability)}  ${c.cyan}${file}${loc}${c.reset}`);
    console.log(`  ${' '.repeat(6)}${h.message} ${c.dim}(${h.rule})${c.reset}`);
    console.log(`  ${' '.repeat(6)}${c.dim}key: ${h.key}${c.reset}`);
    console.log();
  }
}

export async function cmdSummary(): Promise<void> {
  const [issues, hotspots] = await Promise.all([
    api<IssueSearchResult>('/api/issues/search', {
      componentKeys: PROJECT_KEY,
      statuses: 'OPEN',
      ps: '1',
      facets: 'types,severities',
      ...prParam(),
    }),
    api<HotspotSearchResult>('/api/hotspots/search', {
      projectKey: PROJECT_KEY,
      status: 'TO_REVIEW',
      ps: '1',
      ...prParam(),
    }),
  ]);

  heading(`Project: ${c.cyan}${PROJECT_KEY}${c.reset}`);

  const issueData = issues as IssueSearchResult & {
    facets?: Array<{
      property: string;
      values: Array<{
        val: string;
        count: number;
      }>;
    }>;
  };

  const typeFacet = issueData.facets?.find((f) => f.property === 'types');
  const sevFacet = issueData.facets?.find((f) => f.property === 'severities');

  console.log(`  ${c.bold}Issues:${c.reset} ${issues.total} open`);
  if (typeFacet) {
    for (const { val, count } of typeFacet.values) {
      if (count > 0) {
        console.log(`    ${typeBadge(val)} ${count}`);
      }
    }
  }
  console.log();
  if (sevFacet) {
    console.log(`  ${c.bold}By Severity:${c.reset}`);
    for (const { val, count } of sevFacet.values) {
      if (count > 0) {
        console.log(`    ${severityBadge(val)} ${count}`);
      }
    }
  }
  console.log();
  console.log(`  ${c.bold}Hotspots:${c.reset} ${hotspots.paging.total} to review`);
  console.log();
}

export async function cmdTransition(
  issueKey: string,
  transition: string,
  comment?: string
): Promise<void> {
  await apiPost('/api/issues/do_transition', { issue: issueKey, transition });
  success(`Issue ${c.cyan}${issueKey}${c.reset}${c.green} → ${transition}`);

  if (comment) {
    await apiPost('/api/issues/add_comment', { issue: issueKey, text: comment });
    info(`Comment: "${comment}"`);
  }
}

export async function cmdBulkFp(
  ruleKey: string,
  reason: string,
  flags: Record<string, string>
): Promise<void> {
  const data = await api<IssueSearchResult>('/api/issues/search', {
    componentKeys: PROJECT_KEY,
    statuses: 'OPEN',
    rules: ruleKey,
    ps: flags.limit ?? '100',
    ...prParam(),
  });

  heading(`Bulk False Positive — ${data.total} issues for rule ${c.cyan}${ruleKey}${c.reset}`);

  if (data.issues.length === 0) {
    info('No matching issues found.');
    return;
  }

  let ok = 0;
  let failed = 0;

  for (const issue of data.issues) {
    const file = shortPath(issue.component, PROJECT_KEY);
    const loc = issue.line ? `:${issue.line}` : '';
    try {
      await apiPost('/api/issues/do_transition', {
        issue: issue.key,
        transition: 'falsepositive',
      });
      if (reason) {
        await apiPost('/api/issues/add_comment', { issue: issue.key, text: reason });
      }
      success(`${file}${loc} → false positive`);
      ok++;
    } catch {
      console.error(`  ${c.red}FAILED${c.reset} ${file}${loc}`);
      failed++;
    }
  }

  console.log();
  info(`Done: ${ok} marked, ${failed} failed`);
}

export async function cmdHotspotSafe(hotspotKey: string, comment?: string): Promise<void> {
  const body: Record<string, string> = {
    hotspot: hotspotKey,
    status: 'REVIEWED',
    resolution: 'SAFE',
  };
  if (comment) {
    body.comment = comment;
  }
  await apiPost('/api/hotspots/change_status', body);
  success(`Hotspot ${c.cyan}${hotspotKey}${c.reset}${c.green} → SAFE`);
  if (comment) {
    info(`Comment: "${comment}"`);
  }
}

export async function cmdBulkHotspotSafe(
  ruleKey: string,
  comment: string,
  flags: Record<string, string>
): Promise<void> {
  const data = await api<HotspotSearchResult>('/api/hotspots/search', {
    projectKey: PROJECT_KEY,
    status: 'TO_REVIEW',
    ps: flags.limit ?? '50',
    ...prParam(),
  });

  // Filter by rule if specified
  const matching = ruleKey
    ? data.hotspots.filter((h) => h.rule === ruleKey || h.rule.endsWith(`:${ruleKey}`))
    : data.hotspots;

  heading(
    `Bulk Hotspot Review — ${matching.length} hotspots${ruleKey ? ` for rule ${c.cyan}${ruleKey}${c.reset}` : ''}`
  );

  if (matching.length === 0) {
    info('No matching hotspots found.');
    return;
  }

  let ok = 0;
  let failed = 0;

  for (const h of matching) {
    const file = shortPath(h.component, PROJECT_KEY);
    const loc = h.line ? `:${h.line}` : '';
    try {
      const body: Record<string, string> = {
        hotspot: h.key,
        status: 'REVIEWED',
        resolution: 'SAFE',
      };
      if (comment) {
        body.comment = comment;
      }
      await apiPost('/api/hotspots/change_status', body);
      success(`${file}${loc} → SAFE`);
      ok++;
    } catch {
      console.error(`  ${c.red}FAILED${c.reset} ${file}${loc}`);
      failed++;
    }
  }

  console.log();
  info(`Done: ${ok} marked safe, ${failed} failed`);
}
