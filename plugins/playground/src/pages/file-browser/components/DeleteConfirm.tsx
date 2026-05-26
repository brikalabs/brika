import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@brika/sdk/ui-kit';
import type { FsEntry } from '../types';

interface DeleteConfirmProps {
  entry: FsEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DeleteConfirm({
  entry,
  open,
  onOpenChange,
  onConfirm,
}: Readonly<DeleteConfirmProps>) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {entry.isDirectory ? 'folder' : 'file'}?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-mono text-foreground">{entry.name}</span> will be permanently
            deleted.{entry.isDirectory ? ' The folder must be empty.' : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
