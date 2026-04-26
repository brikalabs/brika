import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@brika/clay';
import { useLocale } from '@/lib/use-locale';

interface DeleteDialogProps {
  workflowId: string | null;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteDialog({
  workflowId,
  open,
  onClose,
  onConfirm,
}: Readonly<DeleteDialogProps>) {
  const { t } = useLocale();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('workflows:deleteDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('workflows:deleteDialog.description', {
              id: workflowId,
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {t('common:actions.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
