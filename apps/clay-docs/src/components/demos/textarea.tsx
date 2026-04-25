import { Textarea } from '@brika/clay/components/textarea';

export function TextareaDefaultDemo() {
  return (
    <div className="w-full max-w-xs">
      <Textarea placeholder="Tell us more…" rows={4} />
    </div>
  );
}
