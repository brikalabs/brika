/**
 * Re-export @clack/prompts through a local module.
 *
 * Tests mock this file instead of the global @clack/prompts package,
 * preventing Bun's mock.module() bleed (oven-sh/bun#12823) from
 * corrupting other test files that import @clack/prompts directly.
 */
export * from '@clack/prompts';
