/**
 * Tailwind preset stub for `@brika/clay`.
 *
 * PR #1 ships an empty preset whose only job is to tell Tailwind where Clay's
 * source files live so class-scanning works when a downstream app merges this
 * preset into its own config. Token definitions, utilities, and theme plumbing
 * land in PR #2 (token system) and PR #3 (themes).
 */
export const clayPreset = {
  content: ['./src/**/*.{ts,tsx}'],
} as const;

export default clayPreset;
