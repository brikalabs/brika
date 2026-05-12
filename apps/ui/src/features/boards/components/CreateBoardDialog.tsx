import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Separator,
} from '@brika/clay';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { useLocale } from '@/lib/use-locale';
import { paths } from '@/routes/paths';
import { useCreateBoard } from '../hooks';
import { useBoardStore } from '../store';
import { BoardFormFields } from './BoardFormFields';
import { IconPicker } from './IconPicker';

export function CreateBoardDialog() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const open = useBoardStore((s) => s.createBoardOpen);
  const setOpen = useBoardStore((s) => s.setCreateBoardOpen);

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const { mutate: createBoard, isPending: creating } = useCreateBoard();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setName('');
      setIcon('');
    }
  };

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && !creating;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      return;
    }
    createBoard(
      { name: trimmedName, icon: icon.trim() },
      {
        onSuccess: (board) => {
          setOpen(false);
          navigate({ to: paths.boards.detail.to({ boardId: board.id }) });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('boards:board.new')}</DialogTitle>
          <DialogDescription>{t('boards:board.newDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <BoardFormFields
            name={name}
            icon={icon}
            onNameChange={setName}
            inputId="create-board-name"
            autoFocus
          />

          <Separator />

          <IconPicker value={icon} onChange={setIcon} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" disabled={!canSubmit} aria-busy={creating}>
              {creating ? t('common:messages.loading') : t('common:actions.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
