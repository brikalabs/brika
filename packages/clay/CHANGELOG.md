# Changelog

All notable changes to `@brika/clay` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0 — 2026-04-27

Initial public release.

### Added

- 38 React 19 components (alert-dialog, avatar, badge, breadcrumb,
  button, button-group, card, chart, code-block, collapsible, dialog,
  dropdown-menu, empty-state, input, input-group, label, overflow-list,
  page-header, password-input, popover, progress, progress-display,
  scroll-area, section, section-label, select, separator, sheet,
  sidebar, skeleton, slider, switch, table, tabs, textarea, tooltip,
  brika-logo, plus the `cn` / `cssVars` / `useIsMobile` primitives).
- 17 first-party themes — 11 colour-only (default, ocean, forest,
  sunset, lavender, ruby, nord, solarized, candy, dracula, mono) and
  6 showcase themes (brutalist, editorial, terminal, skeuomorph, glass,
  comic).
- Three-layer token system (scalars / roles / per-component) driven by
  a single TypeScript registry.
- Tailwind v4 plugin at `@brika/clay/tailwind` that contributes tokens,
  dark-mode overrides, and per-component utilities.
- `applyTheme`, `themeToCssVars`, `renderThemeStyleSheet`, and
  `ThemeScope` helpers for runtime theme switching and scoped previews.
- Granular import paths (`@brika/clay/components/<name>`,
  `@brika/clay/themes`, `@brika/clay/tokens`, `@brika/clay/primitives`)
  with `"sideEffects": false` for tree-shaking.
- Build pipeline: tsup → `dist/` ESM + `.d.ts` + sourcemaps, with
  `'use client';` banner stamped on every component chunk.
