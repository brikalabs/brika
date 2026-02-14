import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { useEmitEvent } from '../sparks-hooks';

interface CustomEmitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomEmitDialog({ open, onOpenChange }: Readonly<CustomEmitDialogProps>) {
  const { t } = useLocale();
  const emitEvent = useEmitEvent();
  const [type, setType] = useState('test.event');
  const [payload, setPayload] = useState('{"message": "hello"}');

  const handleEmit = async () => {
    try {
      await emitEvent.mutateAsync({ type, payload: JSON.parse(payload) });
      onOpenChange(false);
    } catch {
      // Invalid JSON or emit error
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('sparks:dialog.customTitle')}</DialogTitle>
          <DialogDescription>{t('sparks:dialog.customDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('sparks:labels.type')}</Label>
            <Input
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="plugin:spark-id"
            />
          </div>
          <div className="space-y-2">
            <Label>{t('sparks:labels.payload')}</Label>
            <Textarea
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              className="min-h-[100px] font-mono text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={handleEmit} disabled={emitEvent.isPending} className="gap-2">
            {emitEvent.isPending && <Loader2 className="size-4 animate-spin" />}
            {t('sparks:actions.emit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
