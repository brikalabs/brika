import { useTools, useToolCall } from "./hooks";
import {
  Button,
  Card,
  CardContent,
  Badge,
  Input,
  Label,
  Separator,
  Switch,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui";
import { RefreshCw, Play, Wrench, Terminal, Loader2, Info, Check, X } from "lucide-react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import type { ToolSummary, ToolInputSchema } from "@elia/shared";
import { useState, useEffect } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Schema-driven Form Field
// ─────────────────────────────────────────────────────────────────────────────

interface FieldProps {
  name: string;
  schema: NonNullable<ToolInputSchema["properties"]>[string];
  value: unknown;
  onChange: (value: unknown) => void;
  required?: boolean;
}

function SchemaField({ name, schema, value, onChange, required }: FieldProps) {
  const id = `field-${name}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label htmlFor={id} className="font-medium">
          {name}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
        {schema.description && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="size-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-[250px]">{schema.description}</TooltipContent>
          </Tooltip>
        )}
        <Badge variant="secondary" className="text-[10px] ml-auto">
          {schema.type}
        </Badge>
      </div>

      {schema.type === "boolean" ? (
        <div className="flex items-center gap-2">
          <Switch id={id} checked={value === true} onCheckedChange={(checked) => onChange(checked)} />
          <span className="text-sm text-muted-foreground">{value ? "true" : "false"}</span>
        </div>
      ) : schema.type === "number" ? (
        <Input
          id={id}
          type="number"
          value={value === undefined ? (schema.default ?? "") : String(value)}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
          placeholder={schema.default !== undefined ? `Default: ${schema.default}` : undefined}
          className="font-mono"
        />
      ) : schema.enum ? (
        <select
          id={id}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
        >
          <option value="">Select...</option>
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
          value={value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value || undefined)}
          placeholder={schema.default !== undefined ? `Default: ${schema.default}` : `Enter ${name}...`}
          className={schema.type === "string" ? "" : "font-mono"}
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

function ToolCallDialog({ tool, onClose }: CallDialogProps) {
  const callTool = useToolCall();
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<{ ok: boolean; content?: string; data?: unknown } | null>(null);

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
      if (value === undefined || value === "") {
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
      setResult({ ok: false, content: `Error: ${e}` });
    }
  };

  return (
    <Dialog open={!!tool} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-auto">
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
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wrench className="size-4" />
                <span>Arguments</span>
              </div>
              <div className="grid gap-4 p-4 rounded-lg border bg-muted/20">
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
            <div className="p-4 rounded-lg border bg-muted/20 text-center text-sm text-muted-foreground">
              <Wrench className="size-6 mx-auto mb-2 opacity-50" />
              This tool has no input arguments
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
                      Success
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <X className="size-3" />
                      Failed
                    </Badge>
                  )}
                </div>
                {result.content && <div className="p-3 rounded-lg bg-muted text-sm">{result.content}</div>}
                {result.data && (
                  <pre className="p-3 rounded-lg bg-muted text-xs font-mono overflow-auto max-h-[150px]">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={handleCall} disabled={callTool.isPending} className="gap-2">
            {callTool.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Call
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
  const { data: tools = [], isLoading, refetch } = useTools();
  const [selected, setSelected] = useState<ToolSummary | null>(null);

  const getArgCount = (t: ToolSummary) => {
    const props = t.inputSchema?.properties;
    if (!props) return 0;
    return Object.keys(props).length;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tools</h2>
          <p className="text-muted-foreground">Registered tools from plugins</p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isLoading} className="gap-2">
          <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[280px]">Tool</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[80px]">Args</TableHead>
                <TableHead className="w-[140px]">Owner</TableHead>
                <TableHead className="w-[70px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <Loader2 className="size-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : tools.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    <Wrench className="size-8 mx-auto mb-2 opacity-50" />
                    No tools registered...
                  </TableCell>
                </TableRow>
              ) : (
                tools.map((t) => {
                  const iconName = (t.icon || "wrench") as IconName;
                  const color = t.color || "#d97706";
                  const owner = t.id.split(":")[0] || "hub";
                  return (
                    <TableRow
                      key={t.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelected(t)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className="flex size-8 items-center justify-center rounded"
                            style={{ backgroundColor: `${color}20`, color }}
                          >
                            <DynamicIcon name={iconName} className="size-4" />
                          </div>
                          <code className="font-mono text-sm font-medium">{t.id}</code>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{t.description || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={getArgCount(t) > 0 ? "secondary" : "outline"}>{getArgCount(t)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs truncate max-w-[120px]">
                          {owner}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(t);
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
