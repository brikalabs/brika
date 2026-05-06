import { Button, Card } from '@brika/clay';
import { useNavigate } from '@tanstack/react-router';
import { Blocks, Plug, Search } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import { paths } from '@/routes/paths';

interface BlocksEmptyProps {
  hasSearch: boolean;
}

export function BlocksEmpty({ hasSearch }: Readonly<BlocksEmptyProps>) {
  const { t } = useLocale();
  const navigate = useNavigate();

  const Icon = hasSearch ? Search : Blocks;

  return (
    <Card className="border-dashed p-16 text-center">
      <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-muted/50">
        <Icon className="size-8 text-muted-foreground opacity-50" />
      </div>
      <h3 className="font-semibold text-base">
        {hasSearch ? t('blocks:noResults') : t('blocks:empty')}
      </h3>
      {hasSearch && (
        <p className="mt-2 text-muted-foreground text-sm">{t('blocks:noResultsHint')}</p>
      )}
      {!hasSearch && (
        <>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground text-sm leading-relaxed">
            {t('blocks:emptyDescription')}
          </p>
          <div className="mt-4">
            <Button onClick={() => navigate({ to: paths.plugins.list.path })}>
              <Plug className="mr-2 size-4" />
              {t('blocks:installPlugin')}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
