import { Badge } from '@brika/clay/components/badge';

export function BadgeDefaultDemo() {
  return <Badge>New</Badge>;
}

export function BadgeVariantsDemo() {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  );
}
