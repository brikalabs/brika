import type { Story } from '@ladle/react';

import { Input } from './Input';

export const Default: Story = () => <Input placeholder="Type here" />;

export const Types: Story = () => (
  <div className="flex max-w-sm flex-col gap-2">
    <Input type="text" placeholder="Text" />
    <Input type="email" placeholder="you@example.com" />
    <Input type="number" placeholder="42" />
    <Input type="search" placeholder="Search…" />
  </div>
);

export const Disabled: Story = () => <Input disabled placeholder="Disabled" />;

export const Invalid: Story = () => <Input aria-invalid="true" defaultValue="not a valid value" />;
