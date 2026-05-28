# @brika/components

Private React components shared across Brika apps.

This package is intentionally tiny — it holds visual primitives that need to look identical across the console UI, the signaling bootstrap SPA, and any future surface. Anything more substantial (form primitives, layout shells, theming) lives in [`@brika/clay`](https://github.com/brikalabs/clay).

## What ships here

- **`BrikaMark`** (default export) — the animated brand mark. Configurable state (`idle`, `thinking`, `error`, …) and respects `prefers-reduced-motion`.
- **`./styles`** (CSS entry) — the Tailwind/clay layer overrides the mark and any future component depends on. Apps `@import` it from their own stylesheet.

## Usage

```tsx
import { BrikaMark, type BrikaMarkState } from '@brika/components/brika-mark';
import '@brika/components/styles';

export function Splash({ state }: { state: BrikaMarkState }) {
  return <BrikaMark state={state} size={96} />;
}
```

## Consumers

- [`apps/signaling`](../../apps/signaling) — bootstrap SPA splash screen.

## Peer dependencies

- `react` ≥ 18.2
- `tailwindcss` ≥ 4 (optional — only required if you import the `./styles` entry)
- `@brika/clay` — provides the token primitives the mark colors use.
