import { Download, Loader2, Package, Trash2 } from 'lucide-react';
import React from 'react';
import { Button, Card, CardContent, Input, Label } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { useStoreMutations } from './hooks';

export function StorePage() {
  const { t } = useLocale();
  const { install, uninstall } = useStoreMutations();
  const [ref, setRef] = React.useState('');
  const [wanted, setWanted] = React.useState('');

  const handleInstall = async () => {
    if (!ref) return;
    await install.mutateAsync({ ref, wanted: wanted || undefined });
    setRef('');
    setWanted('');
  };

  const handleUninstall = async () => {
    if (!ref) return;
    await uninstall.mutateAsync(ref);
    setRef('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-2xl tracking-tight">{t('store:title')}</h2>
        <p className="text-muted-foreground">{t('store:subtitle')}</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-6 flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10">
              <Package className="size-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">{t('store:installPlugin')}</h3>
              <p className="text-muted-foreground text-sm">{t('store:installHint')}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('store:labels.reference')}</Label>
              <Input
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder="@elia/plugin-hue or git+https://..."
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('store:labels.version')}</Label>
              <Input
                value={wanted}
                onChange={(e) => setWanted(e.target.value)}
                placeholder="^1.0.0"
                className="font-mono"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleInstall}
                disabled={install.isPending || !ref}
                className="gap-2"
              >
                {install.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                {t('store:actions.install')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleUninstall}
                disabled={uninstall.isPending || !ref}
                className="gap-2"
              >
                {uninstall.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                {t('store:actions.uninstall')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-12 text-center">
          <Package className="mx-auto mb-4 size-12 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">{t('store:registryComingSoon')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
