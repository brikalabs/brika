import type { Story } from '@ladle/react';

import { Button } from './Button';

export const Default: Story = () => <Button>Click me</Button>;

export const AllVariants: Story = () => (
  <div className="flex flex-wrap gap-3">
    <Button variant="default">Default</Button>
    <Button variant="destructive">Destructive</Button>
    <Button variant="outline">Outline</Button>
    <Button variant="secondary">Secondary</Button>
    <Button variant="ghost">Ghost</Button>
    <Button variant="link">Link</Button>
  </div>
);

export const Sizes: Story = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button size="xs">Extra small</Button>
    <Button size="sm">Small</Button>
    <Button size="default">Default</Button>
    <Button size="lg">Large</Button>
  </div>
);

export const Disabled: Story = () => <Button disabled>Disabled</Button>;
