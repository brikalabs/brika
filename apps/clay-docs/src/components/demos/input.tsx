import { Input } from '@brika/clay/components/input';

/** Default. */
export function InputDefaultDemo() {
  return <Input placeholder="Type something…" />;
}

/** Email / number / search variants — every native type passes through. */
export function InputTypesDemo() {
  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      <Input type="email" placeholder="you@example.com" />
      <Input type="number" placeholder="42" />
      <Input type="search" placeholder="Search…" />
    </div>
  );
}

/** Invalid state via aria-invalid. */
export function InputInvalidDemo() {
  return <Input aria-invalid="true" defaultValue="not a valid value" />;
}

/** Disabled. */
export function InputDisabledDemo() {
  return <Input disabled placeholder="Disabled" />;
}
