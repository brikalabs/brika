import { Label, Skeleton } from '@brika/clay';
import { lazy, Suspense } from 'react';
import { useLocale } from '@/lib/use-locale';

const IconPickerGrid = lazy(() => import('./IconPickerGrid'));

function IconPickerSkeleton() {
  const { t } = useLocale();

  return (
    <div className="space-y-2">
      <Label className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {t('boards:board.icon')}
      </Label>
      <Skeleton className="h-9 w-full rounded-md" />
      <div className="grid grid-cols-9 gap-1 rounded-md border p-2">
        {Array.from(
          {
            length: 36,
          },
          (_, i) => (
            <Skeleton key={i} className="size-9 rounded-md" />
          )
        )}
      </div>
    </div>
  );
}

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

export function IconPicker(props: Readonly<IconPickerProps>) {
  return (
    <Suspense fallback={<IconPickerSkeleton />}>
      <IconPickerGrid {...props} />
    </Suspense>
  );
}
