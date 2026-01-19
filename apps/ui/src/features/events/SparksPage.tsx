import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  Pause,
  Play,
  Plug,
  RotateCcw,
  Send,
  Trash2,
  Zap,
} from 'lucide-react';
import React from 'react';
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@/components/ui';
import { fetcher } from '@/lib/query';
import { useLocale } from '@/lib/use-locale';
import { type SparkEvent, useEmitEvent, useSparkStream } from './sparks-hooks';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface RegisteredSpark {
  type: string;
  id: string;
  pluginId: string;
  name?: string;
  description?: string;
  schema?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

function useSparks() {
  return useQuery({
    queryKey: ['sparks'],
    queryFn: () => fetcher<RegisteredSpark[]>('/api/sparks'),
    refetchInterval: 5000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────

function SparkSchemaViewer({ schema }: { schema?: Record<string, unknown> }) {
  const [expanded, setExpanded] = React.useState(false);

  if (!schema) {
    return <span className="text-muted-foreground text-xs italic">No schema</span>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(!expanded);
        }}
        className="flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <span>Schema</span>
      </button>
      {expanded && (
        <pre
          className="mt-2 max-h-48 overflow-auto rounded-md border bg-muted/50 p-2 font-mono text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          {JSON.stringify(schema, null, 2)}
        </pre>
      )}
    </div>
  );
}

function EmitSparkDialog({
  spark,
  open,
  onOpenChange,
}: {
  spark: RegisteredSpark;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLocale();
  const emitSpark = useEmitEvent();
  const [payload, setPayload] = React.useState('{}');
  const [error, setError] = React.useState<string | null>(null);

  // Generate default payload from schema
  React.useEffect(() => {
    if (spark.schema && open) {
      try {
        const defaultPayload = generateDefaultFromSchema(spark.schema);
        setPayload(JSON.stringify(defaultPayload, null, 2));
        setError(null);
      } catch {
        setPayload('{}');
      }
    }
  }, [spark.schema, open]);

  const handleEmit = async () => {
    try {
      const parsedPayload = JSON.parse(payload);
      await emitSpark.mutateAsync({ type: spark.type, payload: parsedPayload });
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

function RegisteredSparksTab() {
  const { t, tp } = useLocale();
  const { data: sparks = [], isLoading } = useSparks();
  const [selectedSpark, setSelectedSpark] = React.useState<RegisteredSpark | null>(null);
  const [emitDialogOpen, setEmitDialogOpen] = React.useState(false);

  // Group sparks by plugin
  const sparksByPlugin = React.useMemo(() => {
    const grouped = new Map<string, RegisteredSpark[]>();
    for (const spark of sparks) {
      const existing = grouped.get(spark.pluginId) || [];
      grouped.set(spark.pluginId, [...existing, spark]);
    }
    return grouped;
  }, [sparks]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sparks.length === 0) {
    return (
      <div className="py-12 text-center">
        <Zap className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h3 className="font-semibold">{t('sparks:emptyRegistry')}</h3>
        <p className="mt-1 text-muted-foreground">{t('sparks:emptyRegistryHint')}</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {[...sparksByPlugin.entries()].map(([pluginId, pluginSparks]) => (
          <div key={pluginId}>
            <div className="mb-3 flex items-center gap-2">
              <Plug className="size-4 text-muted-foreground" />
              <span className="font-mono text-muted-foreground text-sm">{pluginId}</span>
              <Badge variant="secondary" className="text-xs">
                {pluginSparks.length}
              </Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pluginSparks.map((spark) => (
                <Card
                  key={spark.type}
                  interactive
                  className="cursor-pointer p-4"
                  onClick={() => {
                    setSelectedSpark(spark);
                    setEmitDialogOpen(true);
                  }}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="size-10 bg-amber-500/20">
                      <AvatarFallback className="bg-amber-500/20 text-amber-500">
                        <Zap className="size-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-sm">
                        {tp(pluginId, `sparks.${spark.id}.name`, spark.name || spark.id)}
                      </div>
                      <div className="truncate font-mono text-muted-foreground text-xs">
                        {spark.type}
                      </div>
                      {spark.description && (
                        <div className="mt-1 line-clamp-2 text-muted-foreground text-xs">
                          {tp(pluginId, `sparks.${spark.id}.description`, spark.description)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3">
                    <SparkSchemaViewer schema={spark.schema} />
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
      {selectedSpark && (
        <EmitSparkDialog
          spark={selectedSpark}
          open={emitDialogOpen}
          onOpenChange={setEmitDialogOpen}
        />
      )}
    </>
  );
}

function EventStreamTab() {
  const { t, formatTime } = useLocale();
  const { events, paused, clear, togglePaused } = useSparkStream();
  const emitEvent = useEmitEvent();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [type, setType] = React.useState('test.event');
  const [payload, setPayload] = React.useState('{"message": "hello"}');
  const [resendingId, setResendingId] = React.useState<string | null>(null);

  const handleResend = async (event: SparkEvent) => {
    setResendingId(event.id);
    try {
      await emitEvent.mutateAsync({ type: event.type, payload: event.payload });
    } finally {
      setResendingId(null);
    }
  };

  const handleEmit = async () => {
    try {
      await emitEvent.mutateAsync({ type, payload: JSON.parse(payload) });
      setDialogOpen(false);
    } catch {
      // Invalid JSON or emit error - ignore
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant={paused ? 'default' : 'secondary'}
          size="sm"
          onClick={togglePaused}
          className="gap-2"
        >
          {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          {paused ? t('sparks:actions.resume') : t('sparks:actions.pause')}
        </Button>
        <Button variant="outline" size="sm" onClick={clear} className="gap-2">
          <Trash2 className="size-4" />
          {t('sparks:actions.clear')}
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button size="sm" className="gap-2" onClick={() => setDialogOpen(true)}>
            <Send className="size-4" />
            {t('sparks:actions.emitCustom')}
          </Button>
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
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {t('common:actions.cancel')}
              </Button>
              <Button onClick={handleEmit} disabled={emitEvent.isPending} className="gap-2">
                {emitEvent.isPending && <Loader2 className="size-4 animate-spin" />}
                {t('sparks:actions.emit')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary">{events.length}</Badge>
          {paused && <Badge variant="outline">{t('sparks:paused')}</Badge>}
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            {events.length === 0 ? (
              <div className="p-12 text-center">
                <Clock className="mx-auto mb-4 size-12 text-muted-foreground" />
                <h3 className="font-semibold">{t('sparks:emptyStream')}</h3>
                <p className="mt-1 text-muted-foreground">{t('sparks:emptyStreamHint')}</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {events.map((e) => (
                  <div key={e.id} className="group px-4 py-3.5 transition-colors hover:bg-muted/30">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9 bg-amber-500/10 shadow-sm">
                          <AvatarFallback className="bg-amber-500/10 text-amber-500">
                            <Zap className="size-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="truncate font-mono font-semibold text-sm leading-tight">
                            {e.type}
                          </div>
                          <div className="mt-0.5 text-muted-foreground text-xs">
                            {t('sparks:from')} <span className="font-medium">{e.source}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={() => handleResend(e)}
                          disabled={resendingId === e.id}
                          title={t('sparks:actions.resend')}
                        >
                          {resendingId === e.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="size-3.5" />
                          )}
                        </Button>
                        <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                          {formatTime(e.ts)}
                        </span>
                      </div>
                    </div>
                    {e.payload != null && (
                      <pre className="mt-2.5 ml-12 max-h-24 overflow-auto rounded-md border border-border/50 bg-muted/50 p-2.5 font-mono text-muted-foreground text-xs leading-relaxed">
                        {JSON.stringify(e.payload, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateDefaultFromSchema(schema: Record<string, unknown>): unknown {
  if (schema.type === 'object' && schema.properties) {
    const result: Record<string, unknown> = {};
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    for (const [key, propSchema] of Object.entries(properties)) {
      result[key] = generateDefaultFromSchema(propSchema);
    }
    return result;
  }
  if (schema.type === 'string') return schema.default ?? '';
  if (schema.type === 'number' || schema.type === 'integer') return schema.default ?? 0;
  if (schema.type === 'boolean') return schema.default ?? false;
  if (schema.type === 'array') return schema.default ?? [];
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

type SparkTab = 'registry' | 'stream';

export function SparksPage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { tab?: string };
  const activeTab: SparkTab = params.tab === 'stream' ? 'stream' : 'registry';

  const handleTabChange = (tab: string) => {
    navigate({ to: `/sparks/${tab}` });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">{t('sparks:title')}</h1>
        <p className="mt-1 text-muted-foreground">{t('sparks:subtitle')}</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList>
          <TabsTrigger value="registry" className="gap-2">
            <Zap className="size-4" />
            {t('sparks:tabs.registry')}
          </TabsTrigger>
          <TabsTrigger value="stream" className="gap-2">
            <Clock className="size-4" />
            {t('sparks:tabs.stream')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="registry" className="mt-6">
          <RegisteredSparksTab />
        </TabsContent>
        <TabsContent value="stream" className="mt-6">
          <EventStreamTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
