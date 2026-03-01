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
  board: BoardSummary;
  onDeleted: () => void;
}

export function EditBoardDialog({
  open,
  onOpenChange,
  board,
  onDeleted,
}: Readonly<EditBoardDialogProps>) {
  const { t } = useLocale();
  const [name, setName] = useState(board.name);
  const [icon, setIcon] = useState(board.icon ?? '');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { mutate: updateBoard, isPending: saving } = useUpdateBoard();
  const { mutate: deleteBoard, isPending: deleting } = useDeleteBoard();

  // Reset form state when dialog opens or board changes
  useEffect(() => {
    if (!open) {
      return;
    }
    setName(board.name);
    setIcon(board.icon ?? '');
  }, [
    open,
    board.id,
    board.name,
    board.icon,
  ]);

  const handleSave = () => {
    if (!name.trim()) {
      return;
    }
    updateBoard(
      {
        id: board.id,
        data: {
          name: name.trim(),
          icon: icon.trim(),
        },
      },
      {
        onSuccess: () => onOpenChange(false),
      }
    );
  };

  const handleDelete = () => {
    deleteBoard(board.id, {
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
            <DialogTitle>{t('boards:board.edit')}</DialogTitle>
            <DialogDescription>{t('boards:board.editDescription')}</DialogDescription>
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
              {t('boards:board.delete')}
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
            <AlertDialogTitle>{t('boards:board.delete')}</AlertDialogTitle>
            <AlertDialogDescription>{t('boards:board.deleteDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? t('common:messages.loading') : t('boards:board.deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
