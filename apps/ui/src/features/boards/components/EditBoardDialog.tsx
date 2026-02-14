import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Separator,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import type { BoardSummary } from '../api';
import { useDeleteBoard, useUpdateBoard } from '../hooks';
import { BoardFormFields } from './BoardFormFields';
import { IconPicker } from './IconPicker';

interface EditBoardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboard: BoardSummary;
  onDeleted: () => void;
}

export function EditBoardDialog({
  open,
  onOpenChange,
  dashboard,
  onDeleted,
}: Readonly<EditBoardDialogProps>) {
  const { t } = useLocale();
  const [name, setName] = useState(dashboard.name);
  const [icon, setIcon] = useState(dashboard.icon ?? '');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { mutate: updateDashboard, isPending: saving } = useUpdateBoard();
  const { mutate: deleteDashboard, isPending: deleting } = useDeleteBoard();

  // Reset form state when dialog opens or dashboard changes
  useEffect(() => {
    if (!open) return;
    setName(dashboard.name);
    setIcon(dashboard.icon ?? '');
  }, [open, dashboard.id, dashboard.name, dashboard.icon]);

  const handleSave = () => {
    if (!name.trim()) return;
    updateDashboard(
      { id: dashboard.id, data: { name: name.trim(), icon: icon.trim() } },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  const handleDelete = () => {
    deleteDashboard(dashboard.id, {
      onSuccess: () => {
        setDeleteOpen(false);
        onOpenChange(false);
        onDeleted();
      },
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('boards:dashboard.edit')}</DialogTitle>
            <DialogDescription>{t('boards:dashboard.editDescription')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <BoardFormFields
              name={name}
              icon={icon}
              onNameChange={setName}
              onSubmit={handleSave}
              inputId="edit-board-name"
            />

            <Separator />

            <IconPicker value={icon} onChange={setIcon} />
          </div>

          <DialogFooter className="sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="mr-1.5 size-3.5" />
              {t('boards:dashboard.delete')}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('common:actions.cancel')}
              </Button>
              <Button onClick={handleSave} disabled={saving || !name.trim()}>
                {saving ? t('common:messages.saving') : t('common:actions.save')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('boards:dashboard.delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('boards:dashboard.deleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? t('common:messages.loading') : t('boards:dashboard.deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
