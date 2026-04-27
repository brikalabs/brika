#!/usr/bin/env bun
/**
 * sonar-fp — thin entry shim.
 *
 * The real implementation lives in `./sonar/` (split into api / cli /
 * commands / coverage / index). This shim keeps the historical
 * `scripts/sonar-fp.ts` path working for any caller that points at it
 * directly (root package.json scripts, the Sonar skill doc, ad-hoc
 * `bun run scripts/sonar-fp.ts ...` invocations).
 */

await import('./sonar/index');
