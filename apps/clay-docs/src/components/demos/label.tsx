import { Input } from '@brika/clay/components/input';
import { Label } from '@brika/clay/components/label';

export function LabelDefaultDemo() {
  return (
    <div className="flex w-full max-w-xs flex-col gap-1.5">
      <Label htmlFor="email-demo">Email</Label>
      <Input id="email-demo" type="email" placeholder="you@example.com" />
    </div>
  );
}
