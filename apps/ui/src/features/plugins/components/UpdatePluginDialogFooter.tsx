import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { Button, DialogFooter } from '@/components/ui';

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
  if (success) {
    return (
      <DialogFooter>
        <Button onClick={onClose}>Done</Button>
      </DialogFooter>
    );
  }

  return (
    <DialogFooter>
      <Button variant="outline" onClick={onClose} disabled={isProcessing}>
        Cancel
      </Button>
      <Button onClick={onAction} disabled={isProcessing} className="gap-2">
        {isProcessing ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {actionLabel}ing...
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
