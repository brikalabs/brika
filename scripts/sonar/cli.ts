/**
 * Terminal helpers for the sonar-fp CLI: ANSI colour palette, message
 * helpers, badge formatters, and arg parsing.
 */

const isColor = Bun.enableANSIColors;

export const c = {
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

export function die(message: string): never {
  console.error(`\n${c.red}${c.bold}  error${c.reset} ${message}\n`);
  process.exit(1);
}

export function info(message: string): void {
  console.log(`${c.dim}  ${message}${c.reset}`);
}

export function success(message: string): void {
  console.log(`${c.green}  ${message}${c.reset}`);
}

export function heading(text: string): void {
  console.log(`\n${c.bold}  ${text}${c.reset}\n`);
}

/** Severity → coloured badge */
export function severityBadge(severity: string): string {
  const map: Record<string, string> = {
    BLOCKER: `${c.bgRed}${c.white}${c.bold} BLK ${c.reset}`,
    CRITICAL: `${c.red}${c.bold}CRIT${c.reset}`,
    MAJOR: `${c.yellow}MAJ ${c.reset}`,
    MINOR: `${c.blue}MIN ${c.reset}`,
    INFO: `${c.dim}INFO${c.reset}`,
  };
  return map[severity] ?? `${c.dim}${severity.padEnd(4)}${c.reset}`;
}

/** Issue type → coloured tag */
export function typeBadge(type: string): string {
  const map: Record<string, string> = {
    BUG: `${c.red}BUG       ${c.reset}`,
    VULNERABILITY: `${c.magenta}VULN      ${c.reset}`,
    CODE_SMELL: `${c.yellow}CODE_SMELL${c.reset}`,
  };
  return map[type] ?? type.padEnd(10);
}

/** Hotspot probability → coloured tag */
export function probBadge(prob: string): string {
  const map: Record<string, string> = {
    HIGH: `${c.red}${c.bold}HIGH${c.reset}`,
    MEDIUM: `${c.yellow}MED ${c.reset}`,
    LOW: `${c.green}LOW ${c.reset}`,
  };
  return map[prob] ?? prob.padEnd(4);
}

export function shortPath(component: string, projectKey: string): string {
  return component.replace(`${projectKey}:`, '');
}

export interface ParsedArgs {
  command: string;
  flags: Record<string, string>;
  positional: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command = '', ...rest] = argv;
  const flags: Record<string, string> = {};
  const positional: string[] = [];

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] ?? '';
    if (arg.startsWith('--') && i + 1 < rest.length) {
      flags[arg.slice(2)] = rest[++i] ?? '';
    } else {
      positional.push(arg);
    }
  }

  return { command, flags, positional };
}

export function usage(): void {
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

    ${c.cyan}coverage${c.reset} [--scope overall|new]              Show files under coverage threshold
             [--threshold N] [--limit N]           ${c.dim}(default: new code, 80%, 100 files)${c.reset}

${c.bold}  OPTIONS${c.reset}
    --pr        Pull request number (scopes all commands to the PR analysis)
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
