import { Separator } from '@brika/clay/components/separator';

export function SeparatorDefaultDemo() {
  return (
    <div className="flex w-full max-w-xs flex-col gap-3">
      <span className="text-sm">Above</span>
      <Separator />
      <span className="text-sm">Below</span>
    </div>
  );
}

export function SeparatorVerticalDemo() {
  return (
    <div className="flex h-12 items-center gap-3">
      <span className="text-sm">Left</span>
      <Separator orientation="vertical" />
      <span className="text-sm">Right</span>
    </div>
  );
}
