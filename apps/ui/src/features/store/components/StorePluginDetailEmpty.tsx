import { Link } from '@tanstack/react-router';
import { ArrowLeft, Package } from 'lucide-react';
import { Card, CardContent } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';

interface StorePluginDetailEmptyProps {
  packageName: string;
}

export function StorePluginDetailEmpty({ packageName }: Readonly<StorePluginDetailEmptyProps>) {
  const { t } = useLocale();

  return (
    <div className="space-y-6">
      <Link
        to="/store"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('store:backToStore')}
      </Link>
      <Card>
        <CardContent className="py-12 text-center">
          <Package className="mx-auto mb-4 size-12 text-muted-foreground" />
          <h3 className="font-semibold text-lg">{t('store:plugin.notFound')}</h3>
          <p className="mt-1 text-muted-foreground">
            {t('store:plugin.notFoundDetail', { name: packageName })}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
