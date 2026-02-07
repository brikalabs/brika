import { Search } from 'lucide-react';
import { Card } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';

interface BlocksEmptyProps {
  hasSearch: boolean;
}

export function BlocksEmpty({ hasSearch }: Readonly<BlocksEmptyProps>) {
  const { t } = useLocale();

  return (
    <Card className="border-dashed p-16 text-center">
      <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-muted/50">
        <Search className="size-8 text-muted-foreground opacity-50" />
      </div>
      <h3 className="font-semibold text-base">
        {hasSearch ? t('blocks:noResults') : t('blocks:empty')}
      </h3>
      {hasSearch && (
        <p className="mt-2 text-muted-foreground text-sm">{t('blocks:noResultsHint')}</p>
      )}
    </Card>
  );
}
