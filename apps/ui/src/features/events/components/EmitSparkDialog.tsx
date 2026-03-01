import { Loader2, Send, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { useEmitEvent } from '../sparks-hooks';
import { SparkSchemaViewer } from './SparkSchemaViewer';

export interface RegisteredSpark {
  type: string;
  id: string;
  pluginId: string;
  name?: string;
  description?: string;
  schema?: Record<string, unknown>;
}

interface EmitSparkDialogProps {
  spark: RegisteredSpark;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmitSparkDialog({ spark, open, onOpenChange }: Readonly<EmitSparkDialogProps>) {
  const { t } = useLocale();
  const emitSpark = useEmitEvent();
  const [payload, setPayload] = useState('{}');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (spark.schema && open) {
      try {
        const defaultPayload = generateDefaultFromSchema(spark.schema);
        setPayload(JSON.stringify(defaultPayload, null, 2));
        setError(null);
      } catch {
        setPayload('{}');
      }
    }
  }, [
    spark.schema,
    open,
  ]);

  const handleEmit = async () => {
    try {
      const parsedPayload = JSON.parse(payload);
      await emitSpark.mutateAsync({
        type: spark.type,
        payload: parsedPayload,
      });
      onOpenChange(false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="size-5 text-amber-500" />
            {t('sparks:dialog.emitTitle')}
          </DialogTitle>
          <DialogDescription>
            {spark.name || spark.id} ({spark.type})
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('sparks:labels.payload')}</Label>
            <Textarea
              value={payload}
              onChange={(e) => {
                setPayload(e.target.value);
                setError(null);
              }}
              className="min-h-[200px] font-mono text-sm"
              placeholder="{}"
            />
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
          {spark.schema && (
            <div className="rounded-md border bg-muted/30 p-3">
              <SparkSchemaViewer schema={spark.schema} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={handleEmit} disabled={emitSpark.isPending} className="gap-2">
            {emitSpark.isPending && <Loader2 className="size-4 animate-spin" />}
            <Send className="size-4" />
            {t('sparks:actions.emit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function generateDefaultFromSchema(schema: Record<string, unknown>): unknown {
  if (schema.type === 'object' && schema.properties) {
    const result: Record<string, unknown> = {};
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    for (const [key, propSchema] of Object.entries(properties)) {
      result[key] = generateDefaultFromSchema(propSchema);
    }
    return result;
  }
  if (schema.type === 'string') {
    return schema.default ?? '';
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    return schema.default ?? 0;
  }
  if (schema.type === 'boolean') {
    return schema.default ?? false;
  }
  if (schema.type === 'array') {
    return schema.default ?? [];
  }
  return null;
}
