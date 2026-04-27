/**
 * Named re-exports of every first-party Clay theme preset.
 *
 * Export order is the narrative order:
 *   1. default        — Clay's warm-paper / terracotta lockup
 *   2. brika          — original blue-grey classic, opt-in for Brika apps
 *   3. ocean…candy    — colour-only palette walk, warm to cool
 *   4. dracula, synthwave, mono — editorial / hacker-aesthetic colour themes
 *   5. brutalist…comic — showcase themes that exercise the full token surface
 *
 * `themes/registry.ts` derives `builtInThemes` from `Object.values(this)`,
 * so reordering here is the only place the picker order changes.
 *
 * Consumers who want one specific theme can `import { nord } from '@brika/clay/themes'`
 * — the bundler walks the chain to a single JSON file and no other presets
 * travel into their bundle. Pickers and galleries that need the full list
 * should import `builtInThemes` from `@brika/clay/themes/registry`.
 */

// biome-ignore assist/source/organizeImports: export order drives builtInThemes (in ../registry.ts) via Object.values — narrative order matters more than alphabetical
export { default as default_ } from './default.json' with { type: 'json' };
export { default as brika } from './brika.json' with { type: 'json' };
export { default as ocean } from './ocean.json' with { type: 'json' };
export { default as forest } from './forest.json' with { type: 'json' };
export { default as sunset } from './sunset.json' with { type: 'json' };
export { default as lavender } from './lavender.json' with { type: 'json' };
export { default as ruby } from './ruby.json' with { type: 'json' };
export { default as nord } from './nord.json' with { type: 'json' };
export { default as solarized } from './solarized.json' with { type: 'json' };
export { default as candy } from './candy.json' with { type: 'json' };
export { default as dracula } from './dracula.json' with { type: 'json' };
export { default as synthwave } from './synthwave.json' with { type: 'json' };
export { default as mono } from './mono.json' with { type: 'json' };
export { default as brutalist } from './brutalist.json' with { type: 'json' };
export { default as editorial } from './editorial.json' with { type: 'json' };
export { default as terminal } from './terminal.json' with { type: 'json' };
export { default as skeuomorph } from './skeuomorph.json' with { type: 'json' };
export { default as glass } from './glass.json' with { type: 'json' };
export { default as comic } from './comic.json' with { type: 'json' };
