# Button

The default action affordance. Wraps a native `<button>` with a themed variant
system (CVA) and optional `asChild` slot projection.

## When to use

- Primary call-to-action on a form or page (`variant="default"`).
- Secondary actions next to a primary one (`variant="outline"` or `"ghost"`).
- Destructive actions (`variant="destructive"`) — always pair with a confirm step.
- Icon-only controls with `size="icon"` / `icon-sm` / `icon-xs`. Provide an
  `aria-label` on every icon-only button.

## Don't use it for

- Navigation between routes — use a link primitive with `variant="link"`.
- Long-running async work without showing progress — pair with a `Progress`
  or loading state.

## Props

| Prop       | Type                                                                     | Default     |
| ---------- | ------------------------------------------------------------------------ | ----------- |
| `variant`  | `default \| destructive \| outline \| secondary \| ghost \| link`        | `default`   |
| `size`     | `default \| xs \| sm \| lg \| icon \| icon-xs \| icon-sm \| icon-lg`     | `default`   |
| `asChild`  | `boolean` — project props onto the first child via Radix `Slot.Root`     | `false`     |
| ...native  | All native `<button>` attributes (`onClick`, `type`, `disabled`, ...)    | —           |

## Tokens

Consumes the `primary`, `primary-foreground`, `destructive`, and `secondary`
colour tokens. See [button.tokens.ts](./button.tokens.ts).

## Accessibility

- `focus-visible` rings use the `--ring` token for WCAG contrast.
- `disabled` state reduces opacity and blocks pointer events.
- Icon-only buttons REQUIRE an `aria-label`.

## Examples

```tsx
import { Button } from '@brika/clay';

<Button onClick={save}>Save</Button>

<Button variant="destructive" onClick={confirmDelete}>
  Delete permanently
</Button>

<Button asChild>
  <a href="/docs">Read the docs</a>
</Button>
```
