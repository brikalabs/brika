import type { Story } from '@ladle/react';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './Card';

export const Default: Story = () => (
  <Card className="max-w-sm">
    <CardHeader>
      <CardTitle>Welcome to Clay</CardTitle>
      <CardDescription>The raw material bricks are pressed from.</CardDescription>
    </CardHeader>
    <CardContent>Build your UI with components that share a consistent token system.</CardContent>
    <CardFooter>Shipping soon.</CardFooter>
  </Card>
);

export const AccentColours: Story = () => (
  <div className="flex flex-wrap gap-4">
    {(['none', 'blue', 'emerald', 'violet', 'orange', 'purple', 'amber'] as const).map((accent) => (
      <Card key={accent} accent={accent} className="w-48">
        <CardHeader>
          <CardTitle className="capitalize">{accent}</CardTitle>
          <CardDescription>Accent {accent}</CardDescription>
        </CardHeader>
      </Card>
    ))}
  </div>
);

export const Interactive: Story = () => (
  <Card interactive className="max-w-sm">
    <CardHeader>
      <CardTitle>Hover me</CardTitle>
      <CardDescription>Interactive cards respond on hover.</CardDescription>
    </CardHeader>
  </Card>
);
