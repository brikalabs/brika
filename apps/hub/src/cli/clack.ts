/**
 * Re-export @clack/prompts through a local module.
 *
 * Tests mock this file instead of the global @clack/prompts package,
 * preventing Bun's mock.module() bleed (oven-sh/bun#12823) from
 * corrupting other test files that import @clack/prompts directly.
 *
 * Uses destructured import (not `export { } from`) so Bun does NOT
 * follow the re-export chain.
 */
import * as clack from '@clack/prompts';

export const { cancel, confirm, group, intro, isCancel, multiselect, password, select, text } =
  clack;
