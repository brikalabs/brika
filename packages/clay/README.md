# @brika/clay

Brika's React component library and first-party themes.

Clay provides the pressable raw material for every Brika surface: primitives,
components, tokens, and a curated set of built-in themes. Consumers depend on
`@brika/clay` and nothing else from the monorepo — no hub, no feature code.

## Status

Scaffolding phase. Pilot components (`Button`, `Input`, `Card`) are migrated
from `apps/ui/src/components/ui/` in PR #1. The remaining 35 components,
tokens-as-code, built-in themes, Ladle setup, and the public showcase site at
`clay.brika.dev` land in subsequent PRs.

See the full plan for phased rollout.

## Layout

```
src/
  components/<Name>/           # one folder per component (per-component docs + tests)
  primitives/                  # cn, cssVars, applyTheme — cross-cutting helpers
  tokens/                      # token source of truth (PR #2)
  themes/                      # first-party themes (PR #3)
```

## Arch rule

Nothing inside `packages/clay/src/` may import from `@brika/hub`, `@brika/auth`,
`apps/*`, or any feature directory.
