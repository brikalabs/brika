/**
 * Re-export CLI errors for auth commands.
 *
 * Tests mock THIS file instead of @/cli/errors directly,
 * preventing Bun's mock.module() bleed (oven-sh/bun#12823).
 *
 * Uses destructured import (not `export { } from`) so Bun does NOT
 * follow the re-export chain.
 */
import * as errors from '../../errors';

export const { CliError } = errors;
