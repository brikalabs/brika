# Input

A themed single-line text input. Thin wrapper over the native `<input>` that
applies token-driven styling, a focus ring, `aria-invalid` handling, and
sensible defaults for file inputs.

## When to use

- Any single-line text entry: name, email, search, numeric values.
- Pair with `Label` for accessibility when not inside a labeled form row.
- Use `aria-invalid="true"` to surface a validation error.

## Don't use it for

- Multi-line input — use `Textarea`.
- Masked input like passwords — use `PasswordInput`.
- Grouped or prefixed inputs — use `InputGroup`.

## Props

All native `<input>` attributes pass through. No custom props.

## Tokens

Consumes `input-container`, `input-label`, `input-placeholder`, `input-border`.
See [Input.tokens.ts](./Input.tokens.ts).

## Accessibility

- Focus-visible ring uses the `--ring` token.
- `aria-invalid="true"` flips the border to `--destructive`.
- Always pair with a `<Label>` or supply `aria-label`.

## Examples

```tsx
import { Input } from '@brika/clay';

<Input placeholder="Search repositories" />

<Input
  type="email"
  required
  aria-invalid={hasError ? 'true' : undefined}
  defaultValue={user.email}
/>
```
