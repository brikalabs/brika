import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@brika/clay';
import { useCapture } from '@/features/analytics/hooks';
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
  const capture = useCapture();

  const handleCancel = () => {
    capture('workflows.delete_cancelled');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleCancel()}>
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
          <Button variant="outline" onClick={handleCancel}>
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
