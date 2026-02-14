#!/usr/bin/env bun
/**
 * sonar-fp — SonarCloud Issue & Hotspot Manager
 *
 * Manage SonarCloud issues, security hotspots, and false positives
 * directly from the terminal via the SonarCloud REST API.
 *
 * Usage:
 *   bun run scripts/sonar-fp.ts <command> [options]
 *
 * Environment:
 *   SONAR_TOKEN   API token for write operations (https://sonarcloud.io/account/security)
 *   SONAR_PROJECT Override project key (default: "brika")
 *   SONAR_URL     Override base URL (default: "https://sonarcloud.io")
 */

export {};

// ─── Config ──────────────────────────────────────────────────────────────────

const PROJECT_KEY = Bun.env.SONAR_PROJECT ?? 'brika';
const BASE_URL = Bun.env.SONAR_URL ?? 'https://sonarcloud.io';

// ─── ANSI Colors ─────────────────────────────────────────────────────────────

const isColor = Bun.enableANSIColors;

const c = {
  reset: isColor ? '\x1b[0m' : '',
  bold: isColor ? '\x1b[1m' : '',
  dim: isColor ? '\x1b[2m' : '',
  red: isColor ? '\x1b[31m' : '',
  green: isColor ? '\x1b[32m' : '',
  yellow: isColor ? '\x1b[33m' : '',
  blue: isColor ? '\x1b[34m' : '',
  magenta: isColor ? '\x1b[35m' : '',
  cyan: isColor ? '\x1b[36m' : '',
  white: isColor ? '\x1b[37m' : '',
  bgRed: isColor ? '\x1b[41m' : '',
  bgYellow: isColor ? '\x1b[43m' : '',
  bgBlue: isColor ? '\x1b[44m' : '',
  bgMagenta: isColor ? '\x1b[45m' : '',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function die(message: string): never {
  console.error(`\n${c.red}${c.bold}  error${c.reset} ${message}\n`);
  process.exit(1);
}

function info(message: string): void {
  console.log(`${c.dim}  ${message}${c.reset}`);
}

function success(message: string): void {
  console.log(`${c.green}  ${message}${c.reset}`);
}

function heading(text: string): void {
  console.log(`\n${c.bold}  ${text}${c.reset}\n`);
}

/** Severity → colored badge */
function severityBadge(severity: string): string {
  const map: Record<string, string> = {
    BLOCKER: `${c.bgRed}${c.white}${c.bold} BLK ${c.reset}`,
    CRITICAL: `${c.red}${c.bold}CRIT${c.reset}`,
    MAJOR: `${c.yellow}MAJ ${c.reset}`,
    MINOR: `${c.blue}MIN ${c.reset}`,
    INFO: `${c.dim}INFO${c.reset}`,
  };
  return map[severity] ?? `${c.dim}${severity.padEnd(4)}${c.reset}`;
}

/** Issue type → colored tag */
function typeBadge(type: string): string {
  const map: Record<string, string> = {
    BUG: `${c.red}BUG       ${c.reset}`,
    VULNERABILITY: `${c.magenta}VULN      ${c.reset}`,
    CODE_SMELL: `${c.yellow}CODE_SMELL${c.reset}`,
  };
  return map[type] ?? type.padEnd(10);
}

/** Hotspot probability → colored tag */
function probBadge(prob: string): string {
  const map: Record<string, string> = {
    HIGH: `${c.red}${c.bold}HIGH${c.reset}`,
    MEDIUM: `${c.yellow}MED ${c.reset}`,
    LOW: `${c.green}LOW ${c.reset}`,
  };
  return map[prob] ?? prob.padEnd(4);
}

function shortPath(component: string): string {
  return component.replace(`${PROJECT_KEY}:`, '');
}

// ─── API ─────────────────────────────────────────────────────────────────────

function readHeaders(): HeadersInit {
  const token = Bun.env.SONAR_TOKEN;
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

function requireToken(): string {
  const token = Bun.env.SONAR_TOKEN;
  if (!token) {
    die(
      `SONAR_TOKEN is required for write operations.\n` +
        `  ${c.dim}Get yours at: ${c.cyan}https://sonarcloud.io/account/security${c.reset}`
    );
  }
  return token;
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${requireToken()}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
}

async function api<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, BASE_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { headers: readHeaders() });
  if (!res.ok) {
    const text = await res.text();
    die(`API ${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function apiPost<T = unknown>(
  path: string,
  body: Record<string, string>
): Promise<T | string> {
  const url = new URL(path, BASE_URL);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: authHeaders(),
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    die(`API ${res.status} ${res.statusText}: ${text}`);
  }
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('json')) return res.json() as Promise<T>;
  return res.text();
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Issue {
  key: string;
  rule: string;
  severity: string;
  component: string;
  line?: number;
  message: string;
  type: string;
}

interface IssueSearchResult {
  total: number;
  p: number;
  ps: number;
  issues: Issue[];
}

interface Hotspot {
  key: string;
  rule: string;
  component: string;
  line?: number;
  message: string;
  vulnerabilityProbability: string;
  status: string;
}

interface HotspotSearchResult {
  paging: { total: number; pageIndex: number; pageSize: number };
  hotspots: Hotspot[];
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function cmdList(flags: Record<string, string>): Promise<void> {
  const params: Record<string, string> = {
    componentKeys: PROJECT_KEY,
    statuses: 'OPEN',
    ps: flags.limit ?? '100',
    s: 'SEVERITY',
    asc: 'false',
  };
  if (flags.type) params.types = flags.type;
  if (flags.severity) params.severities = flags.severity;
  if (flags.rule) params.rules = flags.rule;

  const data = await api<IssueSearchResult>('/api/issues/search', params);
  const shown = data.issues.length;
  const total = data.total;

  heading(`Open Issues — ${total} total${shown < total ? ` (showing ${shown})` : ''}`);

  if (data.issues.length === 0) {
    success('No issues found!');
    return;
  }

  for (const issue of data.issues) {
    const file = shortPath(issue.component);
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

async function cmdHotspots(flags: Record<string, string>): Promise<void> {
  const data = await api<HotspotSearchResult>('/api/hotspots/search', {
    projectKey: PROJECT_KEY,
    status: 'TO_REVIEW',
    ps: flags.limit ?? '50',
  });

  const shown = data.hotspots.length;
  const total = data.paging.total;

  heading(`Security Hotspots — ${total} to review${shown < total ? ` (showing ${shown})` : ''}`);

  if (data.hotspots.length === 0) {
    success('No hotspots to review!');
    return;
  }

  for (const h of data.hotspots) {
    const file = shortPath(h.component);
    const loc = h.line ? `:${h.line}` : '';
    console.log(`  ${probBadge(h.vulnerabilityProbability)}  ${c.cyan}${file}${loc}${c.reset}`);
    console.log(`  ${' '.repeat(6)}${h.message} ${c.dim}(${h.rule})${c.reset}`);
    console.log(`  ${' '.repeat(6)}${c.dim}key: ${h.key}${c.reset}`);
    console.log();
  }
}

async function cmdSummary(): Promise<void> {
  const [issues, hotspots] = await Promise.all([
    api<IssueSearchResult>('/api/issues/search', {
      componentKeys: PROJECT_KEY,
      statuses: 'OPEN',
      ps: '1',
      facets: 'types,severities',
    }),
    api<HotspotSearchResult>('/api/hotspots/search', {
      projectKey: PROJECT_KEY,
      status: 'TO_REVIEW',
      ps: '1',
    }),
  ]);

  heading(`Project: ${c.cyan}${PROJECT_KEY}${c.reset}`);

  const issueData = issues as IssueSearchResult & {
    facets?: Array<{ property: string; values: Array<{ val: string; count: number }> }>;
  };

  const typeFacet = issueData.facets?.find((f) => f.property === 'types');
  const sevFacet = issueData.facets?.find((f) => f.property === 'severities');

  console.log(`  ${c.bold}Issues:${c.reset} ${issues.total} open`);
  if (typeFacet) {
    for (const { val, count } of typeFacet.values) {
      if (count > 0) console.log(`    ${typeBadge(val)} ${count}`);
    }
  }
  console.log();
  if (sevFacet) {
    console.log(`  ${c.bold}By Severity:${c.reset}`);
    for (const { val, count } of sevFacet.values) {
      if (count > 0) console.log(`    ${severityBadge(val)} ${count}`);
    }
  }
  console.log();
  console.log(`  ${c.bold}Hotspots:${c.reset} ${hotspots.paging.total} to review`);
  console.log();
}

async function cmdTransition(
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

async function cmdBulkFp(
  ruleKey: string,
  reason: string,
  flags: Record<string, string>
): Promise<void> {
  const data = await api<IssueSearchResult>('/api/issues/search', {
    componentKeys: PROJECT_KEY,
    statuses: 'OPEN',
    rules: ruleKey,
    ps: flags.limit ?? '100',
  });

  heading(`Bulk False Positive — ${data.total} issues for rule ${c.cyan}${ruleKey}${c.reset}`);

  if (data.issues.length === 0) {
    info('No matching issues found.');
    return;
  }

  let ok = 0;
  let failed = 0;

  for (const issue of data.issues) {
    const file = shortPath(issue.component);
    const loc = issue.line ? `:${issue.line}` : '';
    try {
      await apiPost('/api/issues/do_transition', { issue: issue.key, transition: 'falsepositive' });
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

async function cmdHotspotSafe(hotspotKey: string, comment?: string): Promise<void> {
  await apiPost('/api/hotspots/change_status', {
    hotspot: hotspotKey,
    status: 'REVIEWED',
    resolution: 'SAFE',
  });
  success(`Hotspot ${c.cyan}${hotspotKey}${c.reset}${c.green} → SAFE`);

  if (comment) {
    await apiPost('/api/hotspots/add_comment', { hotspot: hotspotKey, text: comment });
    info(`Comment: "${comment}"`);
  }
}

async function cmdBulkHotspotSafe(
  ruleKey: string,
  comment: string,
  flags: Record<string, string>
): Promise<void> {
  const data = await api<HotspotSearchResult>('/api/hotspots/search', {
    projectKey: PROJECT_KEY,
    status: 'TO_REVIEW',
    ps: flags.limit ?? '50',
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
    const file = shortPath(h.component);
    const loc = h.line ? `:${h.line}` : '';
    try {
      await apiPost('/api/hotspots/change_status', {
        hotspot: h.key,
        status: 'REVIEWED',
        resolution: 'SAFE',
      });
      if (comment) {
        await apiPost('/api/hotspots/add_comment', { hotspot: h.key, text: comment });
      }
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

// ─── CLI Router ──────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  command: string;
  flags: Record<string, string>;
  positional: string[];
} {
  const [command = '', ...rest] = argv;
  const flags: Record<string, string> = {};
  const positional: string[] = [];

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg.startsWith('--') && i + 1 < rest.length) {
      flags[arg.slice(2)] = rest[++i]!;
    } else {
      positional.push(arg);
    }
  }

  return { command, flags, positional };
}

function usage(): void {
  console.log(`
${c.bold}  sonar-fp${c.reset} — SonarCloud Issue & Hotspot Manager

${c.bold}  USAGE${c.reset}
    bun run scripts/sonar-fp.ts ${c.cyan}<command>${c.reset} [options]

${c.bold}  COMMANDS${c.reset}
    ${c.cyan}summary${c.reset}                                     Overview of open issues & hotspots
    ${c.cyan}list${c.reset}    [--type TYPE] [--severity SEV]       List open issues
            [--rule RULE] [--limit N]
    ${c.cyan}hotspots${c.reset} [--limit N]                         List security hotspots to review

    ${c.cyan}fp${c.reset}      <issue-key> "reason"                 Mark issue as false positive
    ${c.cyan}wontfix${c.reset} <issue-key> "reason"                 Mark issue as won't fix
    ${c.cyan}reopen${c.reset}  <issue-key>                          Reopen a resolved issue

    ${c.cyan}bulk-fp${c.reset} --rule <rule-key> "reason"           Bulk mark all issues of a rule
    ${c.cyan}hotspot-safe${c.reset} <hotspot-key> "comment"         Mark single hotspot as safe
    ${c.cyan}bulk-hotspot-safe${c.reset} [--rule RULE] "comment"    Bulk mark hotspots as safe

${c.bold}  OPTIONS${c.reset}
    --type      BUG | CODE_SMELL | VULNERABILITY
    --severity  BLOCKER | CRITICAL | MAJOR | MINOR | INFO
    --rule      SonarCloud rule key (e.g. typescript:S2245)
    --limit     Max results to fetch (default: 100)

${c.bold}  ENVIRONMENT${c.reset}
    SONAR_TOKEN     API token ${c.dim}(required for write operations)${c.reset}
                    ${c.dim}Get yours at: ${c.cyan}https://sonarcloud.io/account/security${c.reset}
    SONAR_PROJECT   Project key ${c.dim}(default: brika)${c.reset}
    SONAR_URL       Base URL ${c.dim}(default: https://sonarcloud.io)${c.reset}

${c.bold}  EXAMPLES${c.reset}
    ${c.dim}# Quick overview${c.reset}
    bun run scripts/sonar-fp.ts summary

    ${c.dim}# List all bugs${c.reset}
    bun run scripts/sonar-fp.ts list --type BUG

    ${c.dim}# Mark a CSS false positive${c.reset}
    bun run scripts/sonar-fp.ts fp AYx... "Tailwind CSS v4 syntax"

    ${c.dim}# Bulk mark all S2245 (Math.random) hotspots as safe${c.reset}
    bun run scripts/sonar-fp.ts bulk-hotspot-safe --rule typescript:S2245 "UI/demo only, not security-sensitive"
  `);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const { command, flags, positional } = parseArgs(Bun.argv.slice(2));

switch (command) {
  case 'summary':
  case 's':
    await cmdSummary();
    break;

  case 'list':
  case 'ls':
  case 'l':
    await cmdList(flags);
    break;

  case 'hotspots':
  case 'hs':
    await cmdHotspots(flags);
    break;

  case 'fp':
    if (!positional[0]) die('Missing issue key. Usage: sonar-fp fp <issue-key> "reason"');
    await cmdTransition(positional[0], 'falsepositive', positional[1]);
    break;

  case 'wontfix':
  case 'wf':
    if (!positional[0]) die('Missing issue key. Usage: sonar-fp wontfix <issue-key> "reason"');
    await cmdTransition(positional[0], 'wontfix', positional[1]);
    break;

  case 'reopen':
    if (!positional[0]) die('Missing issue key. Usage: sonar-fp reopen <issue-key>');
    await cmdTransition(positional[0], 'reopen');
    break;

  case 'bulk-fp':
  case 'bfp':
    if (!flags.rule) die('Missing --rule flag. Usage: sonar-fp bulk-fp --rule <rule-key> "reason"');
    await cmdBulkFp(flags.rule, positional[0] ?? 'Bulk false positive', flags);
    break;

  case 'hotspot-safe':
  case 'hss':
    if (!positional[0]) die('Missing hotspot key. Usage: sonar-fp hotspot-safe <key> "comment"');
    await cmdHotspotSafe(positional[0], positional[1]);
    break;

  case 'bulk-hotspot-safe':
  case 'bhs':
    await cmdBulkHotspotSafe(flags.rule ?? '', positional[0] ?? 'Reviewed — safe', flags);
    break;

  case 'help':
  case '--help':
  case '-h':
  case '':
  case undefined:
    usage();
    break;

  default:
    die(`Unknown command: "${command}". Run with --help for usage.`);
}
