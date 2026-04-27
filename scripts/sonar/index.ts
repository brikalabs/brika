#!/usr/bin/env bun
/**
 * sonar-fp — SonarCloud Issue & Hotspot Manager (entry point).
 *
 * Parses CLI args, sets the active PR scope, and dispatches to the
 * appropriate command in `./commands.ts` or `./coverage.ts`. Top-level
 * await is required to make the dispatcher fail fast on errors.
 *
 * Usage: bun run scripts/sonar-fp.ts <command> [options]
 */

import { setPrKey } from './api';
import { die, parseArgs, usage } from './cli';
import {
  cmdBulkFp,
  cmdBulkHotspotSafe,
  cmdHotspotSafe,
  cmdHotspots,
  cmdList,
  cmdSummary,
  cmdTransition,
} from './commands';
import { cmdCoverage } from './coverage';

const { command, flags, positional } = parseArgs(Bun.argv.slice(2));
setPrKey(flags.pr);

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
    if (!positional[0]) {
      die('Missing issue key. Usage: sonar-fp fp <issue-key> "reason"');
    }
    await cmdTransition(positional[0], 'falsepositive', positional[1]);
    break;

  case 'wontfix':
  case 'wf':
    if (!positional[0]) {
      die('Missing issue key. Usage: sonar-fp wontfix <issue-key> "reason"');
    }
    await cmdTransition(positional[0], 'wontfix', positional[1]);
    break;

  case 'reopen':
    if (!positional[0]) {
      die('Missing issue key. Usage: sonar-fp reopen <issue-key>');
    }
    await cmdTransition(positional[0], 'reopen');
    break;

  case 'bulk-fp':
  case 'bfp':
    if (!flags.rule) {
      die('Missing --rule flag. Usage: sonar-fp bulk-fp --rule <rule-key> "reason"');
    }
    await cmdBulkFp(flags.rule, positional[0] ?? 'Bulk false positive', flags);
    break;

  case 'hotspot-safe':
  case 'hss':
    if (!positional[0]) {
      die('Missing hotspot key. Usage: sonar-fp hotspot-safe <key> "comment"');
    }
    await cmdHotspotSafe(positional[0], positional[1]);
    break;

  case 'bulk-hotspot-safe':
  case 'bhs':
    await cmdBulkHotspotSafe(flags.rule ?? '', positional[0] ?? 'Reviewed — safe', flags);
    break;

  case 'coverage':
  case 'cov':
    await cmdCoverage(flags);
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
