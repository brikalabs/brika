import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { Button, DialogFooter } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';

interface UpdatePluginDialogFooterProps {
  success: boolean;
  isProcessing: boolean;
  actionLabel: string;
  Icon: LucideIcon;
  onClose: () => void;
  onAction: () => void;
}

export function UpdatePluginDialogFooter({
  success,
  isProcessing,
  actionLabel,
  Icon,
  onClose,
  onAction,
}: Readonly<UpdatePluginDialogFooterProps>) {
  const { t } = useLocale();

  if (success) {
    return (
      <DialogFooter>
        <Button onClick={onClose}>{t('plugins:update.done')}</Button>
      </DialogFooter>
    );
  }

  return (
    <DialogFooter>
      <Button variant="outline" onClick={onClose} disabled={isProcessing}>
        {t('common:actions.cancel')}
      </Button>
      <Button onClick={onAction} disabled={isProcessing} className="gap-2">
        {isProcessing ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {t('plugins:update.processing', {
              action: actionLabel,
            })}
          </>
        ) : (
          <>
            <Icon className="size-4" />
            {actionLabel}
          </>
        )}
      </Button>
    </DialogFooter>
  );
}
