# Card

A surface container that groups related content and actions. Exposes a
header / title / description / content / footer set of subcomponents so
consumers can compose flexible layouts while still reading tokens from the
shared `card-*` token family.

## When to use

- Summary tiles in a dashboard (`accent="none"`).
- Highlighted affordances that need a chart-aligned colour (`accent="blue"`,
  `"emerald"`, etc. — keyed to the theme's `--data-*` scale).
- Interactive rows that behave like link cards (`interactive`).

## Don't use it for

- List rows with heavy density — consider a `Table` instead.
- Primary CTAs on their own — wrap one with a full-page hero section instead.

## Props

### `<Card>`

| Prop          | Type                                                              | Default  |
| ------------- | ----------------------------------------------------------------- | -------- |
| `accent`      | `none \| blue \| emerald \| violet \| orange \| purple \| amber`  | `none`   |
| `interactive` | `boolean` — adds hover treatment and `cursor-pointer`             | `false`  |

### Subcomponents

`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` —
each is a thin wrapper around a native element with tokenised spacing.

## Tokens

Consumes `card-container`, `card-label`. See [Card.tokens.ts](./Card.tokens.ts).

## Accessibility

- `CardTitle` auto-derives an `aria-label` from string children unless one is
  supplied explicitly.
- `interactive` does NOT add `role="button"` — add your own role and
  keyboard handler if you need a fully interactive card.

## Examples

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@brika/clay';

<Card accent="emerald">
  <CardHeader>
    <CardTitle>New plugins available</CardTitle>
    <CardDescription>3 updates are ready to install.</CardDescription>
  </CardHeader>
  <CardContent>…</CardContent>
</Card>
```
