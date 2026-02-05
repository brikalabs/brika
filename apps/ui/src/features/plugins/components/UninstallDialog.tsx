import { Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';

interface UninstallDialogProps {
  pluginName: string;
  isBusy: boolean;
  onUninstall: () => void;
}

export function UninstallDialog({ pluginName, isBusy, onUninstall }: UninstallDialogProps) {
  const { t } = useLocale();

  return (
    <AlertDialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertDialogTrigger asChild>
            <Button size="icon" variant="destructive" disabled={isBusy}>
              <Trash2 className="size-4" />
            </Button>
          </AlertDialogTrigger>
        </TooltipTrigger>
        <TooltipContent>{t('plugins:actions.uninstall')}</TooltipContent>
      </Tooltip>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('plugins:uninstall.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('plugins:uninstall.description', { name: pluginName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onUninstall}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t('plugins:actions.uninstall')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
