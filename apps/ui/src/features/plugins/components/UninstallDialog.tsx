import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@brika/clay';
import { useLocale } from '@/lib/use-locale';

interface UninstallDialogProps {
  pluginName: string;
  isBusy: boolean;
  onUninstall: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UninstallDialog({
  pluginName,
  isBusy,
  onUninstall,
  open,
  onOpenChange,
}: Readonly<UninstallDialogProps>) {
  const { t } = useLocale();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('plugins:uninstall.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('plugins:uninstall.description', {
              name: pluginName,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onUninstall}
            disabled={isBusy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t('plugins:actions.uninstall')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
