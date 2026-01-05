import type { ToolInputSchema, ToolSummary } from '@brika/shared';
import { Check, Info, Loader2, Play, RefreshCw, Terminal, Wrench, X } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { useEffect, useState } from 'react';
import {
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
  Separator,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { useToolCall, useTools } from './hooks';

// ─────────────────────────────────────────────────────────────────────────────
// Schema-driven Form Field
// ─────────────────────────────────────────────────────────────────────────────

interface FieldProps {
  name: string;
  schema: NonNullable<ToolInputSchema['properties']>[string];
  value: unknown;
  onChange: (value: unknown) => void;
  required?: boolean;
}

function SchemaField({ name, schema, value, onChange, required }: Readonly<FieldProps>) {
  const { t } = useLocale();
  const id = `field-${name}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label htmlFor={id} className="font-medium">
          {name}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
        {schema.description && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="size-3.5 cursor-help text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-62.5">{schema.description}</TooltipContent>
          </Tooltip>
        )}
        <Badge variant="secondary" className="ml-auto text-[10px]">
          {schema.type}
        </Badge>
      </div>

      {schema.type === 'boolean' ? (
        <div className="flex items-center gap-2">
          <Switch
            id={id}
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked)}
          />
          <span className="text-muted-foreground text-sm">{value ? 'true' : 'false'}</span>
        </div>
      ) : schema.type === 'number' ? (
        <Input
          id={id}
          type="number"
          value={value === undefined ? String(schema.default ?? '') : String(value)}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
          placeholder={
            schema.default !== undefined
              ? `${t('common:labels.default')}: ${schema.default}`
              : undefined
          }
          className="font-mono"
        />
      ) : schema.enum ? (
        <select
          id={id}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
        >
          <option value="">{t('common:actions.select')}...</option>
          {schema.enum.map((opt) => (
            <option key={String(opt)} value={String(opt)}>
              {String(opt)}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={id}
          type="text"
          value={value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value || undefined)}
          placeholder={
            schema.default !== undefined
              ? `${t('common:labels.default')}: ${schema.default}`
              : `${t('common:labels.enter')} ${name}...`
          }
          className={schema.type === 'string' ? '' : 'font-mono'}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Call Dialog
// ─────────────────────────────────────────────────────────────────────────────

interface CallDialogProps {
  tool: ToolSummary | null;
  onClose: () => void;
}

function ToolCallDialog({ tool, onClose }: Readonly<CallDialogProps>) {
  const { t } = useLocale();
  const callTool = useToolCall();
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<{ ok: boolean; content?: string; data?: unknown } | null>(
    null
  );

  const schema = tool?.inputSchema;
  const properties = schema?.properties ?? {};
  const requiredFields = schema?.required ?? [];
  const hasSchema = Object.keys(properties).length > 0;

  useEffect(() => {
    if (tool) {
      // Reset form with defaults when tool changes
      const defaults: Record<string, unknown> = {};
      for (const [key, prop] of Object.entries(properties)) {
        if (prop.default !== undefined) defaults[key] = prop.default;
      }
      setFormData(defaults);
      setResult(null);
    }
  }, [tool?.id]);

  const updateField = (name: string, value: unknown) => {
    setFormData((prev) => {
      const next = { ...prev };
      if (value === undefined || value === '') {
        delete next[name];
      } else {
        next[name] = value;
      }
      return next;
    });
  };

  const handleCall = async () => {
    if (!tool) return;
    setResult(null);
    try {
      const res = await callTool.mutateAsync({ name: tool.id, args: formData });
      setResult(res);
    } catch (e) {
      setResult({ ok: false, content: `${t('common:labels.error')}: ${e}` });
    }
  };

  return (
    <Dialog open={!!tool} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-150">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="size-5" />
            <code className="font-mono">{tool?.id}</code>
          </DialogTitle>
          {tool?.description && <DialogDescription>{tool.description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-4">
          {hasSchema ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Wrench className="size-4" />
                <span>{t('tools:labels.arguments')}</span>
              </div>
              <div className="grid gap-4 rounded-lg border bg-muted/20 p-4">
                {Object.entries(properties).map(([name, prop]) => (
                  <SchemaField
                    key={name}
                    name={name}
                    schema={prop}
                    value={formData[name]}
                    onChange={(v) => updateField(name, v)}
                    required={requiredFields.includes(name)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border bg-muted/20 p-4 text-center text-muted-foreground text-sm">
              <Wrench className="mx-auto mb-2 size-6 opacity-50" />
              {t('tools:noArguments')}
            </div>
          )}

          {result && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  {result.ok ? (
                    <Badge variant="success" className="gap-1">
                      <Check className="size-3" />
                      {t('common:status.success')}
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <X className="size-3" />
                      {t('common:status.failed')}
                    </Badge>
                  )}
                </div>
                {result.content && (
                  <div className="rounded-lg bg-muted p-3 text-sm">{result.content}</div>
                )}
                {result.data !== undefined && (
                  <pre className="max-h-37.5 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common:actions.close')}
          </Button>
          <Button onClick={handleCall} disabled={callTool.isPending} className="gap-2">
            {callTool.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            {t('tools:actions.call')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function ToolsPage() {
  const { t } = useLocale();
  const { data: tools = [], isLoading, refetch } = useTools();
  const [selected, setSelected] = useState<ToolSummary | null>(null);

  const getArgCount = (tool: ToolSummary) => {
    const props = tool.inputSchema?.properties;
    if (!props) return 0;
    return Object.keys(props).length;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-2xl tracking-tight">{t('tools:title')}</h2>
          <p className="text-muted-foreground">{t('tools:subtitle')}</p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isLoading} className="gap-2">
          <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
          {t('common:actions.refresh')}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-70">{t('tools:labels.tool')}</TableHead>
                <TableHead>{t('common:labels.description')}</TableHead>
                <TableHead className="w-20">{t('tools:labels.args')}</TableHead>
                <TableHead className="w-35">{t('tools:labels.owner')}</TableHead>
                <TableHead className="w-17.5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <Loader2 className="mx-auto size-6 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : tools.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    <Wrench className="mx-auto mb-2 size-8 opacity-50" />
                    {t('tools:empty')}
                  </TableCell>
                </TableRow>
              ) : (
                tools.map((tool) => {
                  const iconName = (tool.icon || 'wrench') as IconName;
                  const color = tool.color || '#d97706';
                  const [pluginId, toolKey] = tool.id.split(':');
                  return (
                    <TableRow
                      key={tool.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelected(tool)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className="flex size-8 items-center justify-center rounded"
                            style={{ backgroundColor: `${color}20`, color }}
                          >
                            <DynamicIcon name={iconName} className="size-4" />
                          </div>
                          <div className="flex flex-col">
                            <code className="font-medium font-mono text-sm">{tool.id}</code>
                            <span className="text-muted-foreground text-xs">{toolKey}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {t(`plugin:${pluginId}:tools.${toolKey}.description`)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getArgCount(tool) > 0 ? 'secondary' : 'outline'}>
                          {getArgCount(tool)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="max-w-30 truncate font-mono text-xs">
                          {pluginId}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(tool);
                          }}
                        >
                          <Play className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ToolCallDialog tool={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
