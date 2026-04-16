/**
 * Re-export bootstrap utilities for auth commands.
 *
 * Tests mock THIS file instead of @/cli/bootstrap directly,
 * preventing Bun's mock.module() bleed (oven-sh/bun#12823).
 *
 * Uses destructured import (not `export { } from`) so Bun does NOT
 * follow the re-export chain.
 */
import * as bootstrap from '../../bootstrap';

export const { bootstrapCLI, printDatabaseInfo } = bootstrap;
