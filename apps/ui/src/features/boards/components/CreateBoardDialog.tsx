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
import { useState } from 'react';
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
    if (next) {
      setName('');
      setIcon('');
    }
  };

  const handleCreate = () => {
    if (!name.trim()) {
      return;
    }
    createBoard(
      {
        name: name.trim(),
        icon: icon.trim(),
      },
      {
        onSuccess: (board) => {
          setOpen(false);
          navigate({
            to: paths.boards.detail.to({ boardId: board.id }),
          });
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

        <div className="space-y-4">
          <BoardFormFields
            name={name}
            icon={icon}
            onNameChange={setName}
            onSubmit={handleCreate}
            inputId="create-board-name"
          />

          <Separator />

          <IconPicker value={icon} onChange={setIcon} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={handleCreate} disabled={creating || !name.trim()}>
            {creating ? t('common:messages.loading') : t('common:actions.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
