#!/usr/bin/env bun
/**
 * sonar-fp — thin entry shim.
 *
 * The real implementation lives in `./sonar/` (split into api / cli /
 * commands / coverage / index). This is the stable entry point callers run
 * directly: the Sonar skill doc and ad-hoc
 * `bun run packages/workspace-tools/src/sonar-fp.ts ...` invocations. The
 * static import makes this a module and runs the CLI on load.
 */

import './sonar/index';
