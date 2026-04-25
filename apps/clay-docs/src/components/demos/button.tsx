import { Button } from '@brika/clay/components/button';
import { Settings } from 'lucide-react';

/** Default solid Button — main call-to-action. */
export function ButtonDefaultDemo() {
  return <Button>Save changes</Button>;
}

/** All six variants in one row. */
export function ButtonVariantsDemo() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button>Default</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
    </div>
  );
}

/** Four text-button sizes. */
export function ButtonSizesDemo() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="xs">XS</Button>
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
    </div>
  );
}

/** Icon-only button with required aria-label. */
export function ButtonIconDemo() {
  return (
    <Button size="icon" aria-label="Settings">
      <Settings />
    </Button>
  );
}
