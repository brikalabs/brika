import { Badge } from '@brika/clay/components/badge';

/**
 * OverflowList is a hook-driven layout primitive — it measures its container
 * and decides how many children fit. A static-card preview can't show that
 * dynamic behaviour usefully, so render the conceptual visual: a row of items
 * collapsing into a "+N" indicator.
 */
export function OverflowListDefaultDemo() {
  return (
    <div className="flex w-full max-w-md flex-wrap items-center gap-1.5">
      <Badge variant="outline">production</Badge>
      <Badge variant="outline">staging</Badge>
      <Badge variant="outline">eu-west-1</Badge>
      <Badge variant="outline">us-east-1</Badge>
      <Badge>+3 more</Badge>
    </div>
  );
}
