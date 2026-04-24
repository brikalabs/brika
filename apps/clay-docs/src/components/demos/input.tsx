import { Input } from '@brika/clay/components/input';

/** Default input for single-line text entry. */
export function InputDefaultDemo() {
  return <Input placeholder="Type something…" />;
}

/** Input in an error state via `aria-invalid`. */
export function InputInvalidDemo() {
  return <Input aria-invalid="true" defaultValue="not a valid value" />;
}

/** Disabled input. */
export function InputDisabledDemo() {
  return <Input disabled placeholder="Disabled" />;
}

/** Email input with typed completion. */
export function InputEmailDemo() {
  return <Input type="email" placeholder="you@example.com" />;
}
