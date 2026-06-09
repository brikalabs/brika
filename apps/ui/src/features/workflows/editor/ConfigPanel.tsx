/**
 * Config Panel
 *
 * Smart schema-driven configuration panel for blocks.
 * Generates appropriate UI controls based on field types.
 *
 * Special type markers (in schema description):
 * - $type:expression → Expression input with variable autocomplete
 * - $type:duration → Duration input with unit selector
 * - $type:color → Color picker
 * - $type:code:language → Code editor
 */

import {
  Badge,
  Button,
  cn,
  Input,
  Label,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Switch,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@brika/clay';
import { displayType, parsePortType } from '@brika/type-system';
import type { Node } from '@xyflow/react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronRight,
  ChevronsUpDown,
  Copy,
  HelpCircle,
  PencilLine,
  Plus,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useCapture } from '@/features/analytics/hooks';
import { fetcher } from '@/lib/query';
import { useLocale } from '@/lib/use-locale';
import { fetchTools, type ToolSummary } from '../api';
import type { BlockNodeData, BlockPort } from './BlockNode';
import { ClientBlockView } from './ClientBlockView';
import { usePortTypeName } from './WorkflowTypeContext';

// ─────────────────────────────────────────────────────────────────────────────
// Type Markers
// ─────────────────────────────────────────────────────────────────────────────

type TypeMarker = 'expression' | 'duration' | 'color' | 'code' | 'secret' | 'url' | 'json';

const TYPE_MARKERS: TypeMarker[] = [
  'expression',
  'duration',
  'color',
  'code',
  'secret',
  'url',
  'json',
];

function getTypeMarker(description?: string): {
  marker: TypeMarker | null;
  extra?: string;
} {
  if (!description) {
    return {
      marker: null,
    };
  }

  for (const marker of TYPE_MARKERS) {
    if (description.includes(`$type:${marker}`)) {
      // Extract extra info after colon (e.g., $type:code:javascript)
      const match = new RegExp(String.raw`\$type:${marker}:?(\w+)?`).exec(description);
      return {
        marker,
        extra: match?.[1],
      };
    }
  }
  return {
    marker: null,
  };
}

/**
 * Safely convert a value to string, handling objects and nullish values
 */
function toDisplayString(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  // symbol | function — not expected for config values.
  return fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Variable {
  name: string;
  source: string;
  type: string;
  /** Short rendering of the value last seen on this path, when one has flowed. */
  preview?: string;
}

interface SchemaProperty {
  type: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  /** UI widget hint from z.dynamicDropdown(), e.g. 'dynamic-dropdown'. */
  format?: string;
  /** UI label from z.meta({ label }). */
  label?: string;
  /** Show this field only when a sibling field equals a value (or one of several). */
  showWhen?: { field: string; equals: ShowWhenValue | ReadonlyArray<ShowWhenValue> };
}

type ShowWhenValue = string | number | boolean;

function isShowWhenValue(value: unknown): value is ShowWhenValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** Narrow an unknown value to the showWhen shape (scalar or array of scalars). */
function toShowWhen(value: unknown): SchemaProperty['showWhen'] {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const obj = Object.fromEntries(Object.entries(value));
  const { equals } = obj;
  if (typeof obj.field !== 'string') {
    return undefined;
  }
  if (isShowWhenValue(equals)) {
    return { field: obj.field, equals };
  }
  if (Array.isArray(equals) && equals.every(isShowWhenValue)) {
    return { field: obj.field, equals };
  }
  return undefined;
}

/** Whether the live field value satisfies a showWhen condition. */
function showWhenSatisfied(
  actual: unknown,
  equals: ShowWhenValue | ReadonlyArray<ShowWhenValue>
): boolean {
  if (Array.isArray(equals)) {
    return isShowWhenValue(actual) && equals.includes(actual);
  }
  return actual === equals;
}

interface BlockSchema {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
}

/** Safely narrow an unknown field schema value to SchemaProperty */
function toSchemaProperty(value: unknown): SchemaProperty {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return {
      type: 'string',
    };
  }
  const obj = Object.fromEntries(Object.entries(value));
  return {
    type: typeof obj.type === 'string' ? obj.type : 'string',
    description: typeof obj.description === 'string' ? obj.description : undefined,
    default: obj.default,
    enum: Array.isArray(obj.enum) ? obj.enum : undefined,
    format: typeof obj.format === 'string' ? obj.format : undefined,
    label: typeof obj.label === 'string' ? obj.label : undefined,
    showWhen: toShowWhen(obj.showWhen),
  };
}

interface ConfigPanelProps {
  node: Node;
  onUpdateBlock: (nodeId: string, config: Record<string, unknown>) => void;
  availableVariables: Variable[];
  blockSchema?: BlockSchema;
  /** When the block ships a custom React view, its compiled module URL. */
  viewModuleUrl?: string;
  /** Owning plugin process UID (present alongside viewModuleUrl). */
  pluginUid?: string;
  onCollapse?: () => void;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Expression Input with Variable Suggestions
// ─────────────────────────────────────────────────────────────────────────────

interface ExpressionFieldProps {
  value: string;
  onChange: (value: string) => void;
  variables: Variable[];
  placeholder?: string;
  multiline?: boolean;
}

function ExpressionField({
  value,
  onChange,
  variables,
  placeholder,
  multiline,
}: Readonly<ExpressionFieldProps>) {
  const capture = useCapture();
  const [showVars, setShowVars] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const insertVariable = (varName: string) => {
    capture('workflow.config_variable_inserted');
    const expr = `{{ ${varName} }}`;
    onChange(value + expr);
    setShowVars(false);
  };

  const copyVariable = (varName: string) => {
    capture('workflow.config_variable_copied', { surface: 'expression_field' });
    navigator.clipboard.writeText(`{{ ${varName} }}`);
    setCopied(varName);
    setTimeout(() => setCopied(null), 1500);
  };

  const InputComponent = multiline ? Textarea : Input;

  return (
    <div className="space-y-2">
      <div className="relative">
        <InputComponent
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn('pr-10 font-mono text-sm', multiline && 'min-h-[80px]')}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute top-1 right-1 h-7 w-7 p-0"
          onClick={() => {
            if (!showVars) {
              capture('workflow.config_variable_picker_opened', {
                variableCount: variables.length,
              });
            }
            setShowVars(!showVars);
          }}
          title="Insert variable"
        >
          <Sparkles className="size-4 text-primary" />
        </Button>
      </div>

      {/* Variable suggestions dropdown */}
      {showVars && variables.length > 0 && (
        <div className="overflow-hidden rounded-lg border bg-popover shadow-lg">
          <div className="border-b bg-muted/50 p-2 font-medium text-muted-foreground text-xs">
            Click to insert variable
          </div>
          <div className="max-h-[150px] overflow-y-auto">
            {variables.map((v) => (
              <div
                key={v.name}
                className="group flex cursor-pointer items-center justify-between px-3 py-2 hover:bg-accent"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
                  onClick={() => insertVariable(v.name)}
                >
                  <span className="flex items-center gap-2">
                    <code className="font-mono text-primary text-xs">{`{{ ${v.name} }}`}</code>
                    <span className="text-muted-foreground text-xs">{v.type}</span>
                  </span>
                  {v.preview !== undefined && (
                    <span className="truncate font-mono text-[10px] text-muted-foreground">
                      {v.preview}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="rounded p-1 opacity-0 hover:bg-muted group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    copyVariable(v.name);
                  }}
                  title="Copy to clipboard"
                >
                  {copied === v.name ? (
                    <Check className="size-3 text-success" />
                  ) : (
                    <Copy className="size-3 text-muted-foreground" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Key-Value Editor for Objects
// ─────────────────────────────────────────────────────────────────────────────

interface KeyValueEditorProps {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  variables: Variable[];
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

function KeyValueEditor({
  value,
  onChange,
  variables,
  keyPlaceholder = 'key',
  valuePlaceholder = 'value',
}: Readonly<KeyValueEditorProps>) {
  const capture = useCapture();
  const entries = Object.entries(value || {});

  const addEntry = () => {
    capture('workflow.config_kv_added', { count: entries.length + 1 });
    const newKey = `key${entries.length + 1}`;
    onChange({
      ...value,
      [newKey]: '',
    });
  };

  const removeEntry = (key: string) => {
    capture('workflow.config_kv_removed', { count: entries.length - 1 });
    const newValue = {
      ...value,
    };
    delete newValue[key];
    onChange(newValue);
  };

  const updateKey = (oldKey: string, newKey: string) => {
    if (oldKey === newKey) {
      return;
    }
    const newValue: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      newValue[k === oldKey ? newKey : k] = v;
    }
    onChange(newValue);
  };

  const updateValue = (key: string, newVal: unknown) => {
    onChange({
      ...value,
      [key]: newVal,
    });
  };

  return (
    <div className="space-y-2">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-start gap-2">
          <Input
            value={k}
            onChange={(e) => updateKey(k, e.target.value)}
            placeholder={keyPlaceholder}
            className="flex-1 font-mono text-xs"
          />
          <div className="flex-[2]">
            <ExpressionField
              value={toDisplayString(v)}
              onChange={(newVal) => updateValue(k, newVal)}
              variables={variables}
              placeholder={valuePlaceholder}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 text-destructive hover:text-destructive"
            onClick={() => removeEntry(k)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" className="w-full" onClick={addEntry}>
        <Plus className="mr-1 size-4" />
        Add {keyPlaceholder}
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema-Driven Form Field
// ─────────────────────────────────────────────────────────────────────────────

interface FieldProps {
  name: string;
  schema: SchemaProperty;
  value: unknown;
  onChange: (value: unknown) => void;
  variables: Variable[];
  required?: boolean;
  pluginId?: string;
  /** Full block type id, used to resolve dynamic-dropdown options. */
  blockType?: string;
  /** Sibling config values, forwarded to provider-aware option providers. */
  allConfig?: Record<string, unknown>;
}

/** Resolved display info passed to each field renderer */
interface ResolvedFieldInfo {
  label: string;
  cleanDescription: string | undefined;
  value: unknown;
  onChange: (value: unknown) => void;
  variables: Variable[];
  defaultValue: unknown;
  name: string;
  blockType?: string;
  allConfig?: Record<string, unknown>;
}

function DurationField({ value, onChange, cleanDescription, label }: Readonly<ResolvedFieldInfo>) {
  const numericValue = typeof value === 'number' ? value : undefined;
  return (
    <DurationInput
      value={numericValue}
      onChange={onChange}
      placeholder={cleanDescription || `Enter ${label.toLowerCase()}`}
    />
  );
}

function ColorField({ value, onChange }: Readonly<ResolvedFieldInfo>) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={toDisplayString(value, '#6366f1')}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-12 cursor-pointer rounded border bg-transparent p-1"
      />
      <Input
        value={toDisplayString(value)}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#6366f1"
        className="flex-1 bg-background font-mono"
      />
    </div>
  );
}

function ExpressionMarkerField({
  value,
  onChange,
  variables,
  cleanDescription,
  label,
}: Readonly<ResolvedFieldInfo>) {
  return (
    <ExpressionField
      value={toDisplayString(value)}
      onChange={(v) => onChange(v)}
      variables={variables}
      placeholder={cleanDescription || `Enter ${label.toLowerCase()}`}
      multiline
    />
  );
}

function SecretField({ value, onChange, cleanDescription, label }: Readonly<ResolvedFieldInfo>) {
  return (
    <Input
      type="password"
      value={toDisplayString(value)}
      onChange={(e) => onChange(e.target.value)}
      placeholder={cleanDescription || `Enter ${label.toLowerCase()}`}
      className="bg-background"
    />
  );
}

function BooleanField({
  value,
  onChange,
  label,
  cleanDescription,
  defaultValue,
}: Readonly<ResolvedFieldInfo>) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
      <div>
        <span className="font-medium text-sm">{label}</span>
        {cleanDescription && (
          <p className="mt-0.5 text-muted-foreground text-xs">{cleanDescription}</p>
        )}
      </div>
      <Switch
        checked={Boolean(value ?? defaultValue)}
        onCheckedChange={(checked) => onChange(checked)}
      />
    </div>
  );
}

function EnumField({
  value,
  onChange,
  label,
  defaultValue,
  enumValues,
}: Readonly<
  ResolvedFieldInfo & {
    enumValues: unknown[];
  }
>) {
  return (
    <Select value={toDisplayString(value ?? defaultValue)} onValueChange={(v) => onChange(v)}>
      <SelectTrigger className="bg-background">
        <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
      </SelectTrigger>
      <SelectContent>
        {enumValues.map((opt) => (
          <SelectItem key={String(opt)} value={String(opt)}>
            {String(opt)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = v;
    }
    return result;
  }
  return {};
}

function ObjectField({ value, onChange, variables }: Readonly<ResolvedFieldInfo>) {
  const objValue = toRecord(value);
  return (
    <KeyValueEditor
      value={objValue}
      onChange={onChange}
      variables={variables}
      keyPlaceholder="argument"
      valuePlaceholder="value or {{ expression }}"
    />
  );
}

function NumberField({
  value,
  onChange,
  cleanDescription,
  label,
  defaultValue,
}: Readonly<ResolvedFieldInfo>) {
  return (
    <Input
      type="number"
      value={toDisplayString(value ?? defaultValue)}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
      placeholder={cleanDescription || `Enter ${label.toLowerCase()}`}
      className="bg-background"
    />
  );
}

function StringField({
  value,
  onChange,
  variables,
  cleanDescription,
  label,
  name,
}: Readonly<ResolvedFieldInfo>) {
  const isMultiline =
    name === 'message' ||
    name === 'if' ||
    name === 'value' ||
    cleanDescription?.toLowerCase().includes('expression') ||
    cleanDescription?.toLowerCase().includes('condition');

  return (
    <ExpressionField
      value={toDisplayString(value)}
      onChange={(v) => onChange(v)}
      variables={variables}
      placeholder={cleanDescription || `Enter ${label.toLowerCase()}`}
      multiline={isMultiline}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic Dropdown (z.dynamicDropdown) - options fetched live, scoped by siblings
// ─────────────────────────────────────────────────────────────────────────────

interface DynamicOption {
  value: string;
  label: string;
  description?: string;
}

/** Short string values longer than this are not forwarded as options params. */
const MAX_PARAM_LENGTH = 200;

/**
 * Short scalar sibling fields, forwarded as the options query (self excluded).
 * Long strings are dropped: option providers key off discriminators (provider,
 * baseUrl), and forwarding a user prompt would bloat the URL and leak its
 * content into request logs.
 */
function siblingParams(
  config: Record<string, unknown> | undefined,
  self: string
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(config ?? {})) {
    if (key === self) {
      continue;
    }
    if (typeof val === 'string') {
      if (val.length <= MAX_PARAM_LENGTH) {
        out[key] = val;
      }
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      out[key] = String(val);
    }
  }
  return out;
}

function fetchBlockConfigOptions(
  blockType: string,
  name: string,
  params: Record<string, string>
): Promise<{ options: DynamicOption[] }> {
  const qs = new URLSearchParams(params).toString();
  const base = `/api/blocks/${encodeURIComponent(blockType)}/config/${encodeURIComponent(name)}/options`;
  return fetcher<{ options: DynamicOption[] }>(qs ? `${base}?${qs}` : base);
}

/**
 * A filter-as-you-type picker whose options are fetched live and re-fetched when
 * a sibling field changes (e.g. the model list for the chosen provider). A
 * persistent escape hatch flips to a free-text input for ids not in the list.
 */
function DynamicSelectField({
  name,
  value,
  onChange,
  label,
  blockType,
  allConfig,
}: Readonly<ResolvedFieldInfo>) {
  const capture = useCapture();
  const current = toDisplayString(value);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [custom, setCustom] = useState(false);
  const [options, setOptions] = useState<DynamicOption[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  const params = useMemo(() => siblingParams(allConfig, name), [allConfig, name]);
  const paramsKey = useMemo(() => JSON.stringify(params), [params]);

  useEffect(() => {
    if (!blockType || custom) {
      return;
    }
    let cancelled = false;
    setStatus('loading');
    fetchBlockConfigOptions(blockType, name, JSON.parse(paramsKey))
      .then((data) => {
        if (!cancelled) {
          setOptions(data.options);
          setStatus('idle');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [blockType, name, paramsKey, custom]);

  if (custom) {
    return (
      <div className="space-y-1.5">
        <Input
          value={current}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Enter a custom ${label.toLowerCase()}`}
          className="bg-background font-mono text-sm"
        />
        <button
          type="button"
          className="text-muted-foreground text-xs hover:text-foreground"
          onClick={() => setCustom(false)}
        >
          Back to the list
        </button>
      </div>
    );
  }

  const needle = filter.trim().toLowerCase();
  const filtered = needle
    ? options.filter((o) =>
        `${o.label} ${o.value} ${o.description ?? ''}`.toLowerCase().includes(needle)
      )
    : options;
  const selected = options.find((o) => o.value === current);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between bg-background font-normal"
        onClick={() => {
          if (!open) {
            capture('workflow.config_dynamic_options_opened', { field: name });
          }
          setOpen(!open);
        }}
      >
        <span className="truncate">
          {selected?.label ?? (current || `Select ${label.toLowerCase()}`)}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </Button>

      {open && (
        <div className="overflow-hidden rounded-lg border bg-popover shadow-lg">
          <div className="border-b p-2">
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`Filter ${label.toLowerCase()}`}
              className="h-8 bg-background text-sm"
            />
          </div>
          <div className="max-h-[220px] overflow-y-auto">
            {status === 'loading' && (
              <p className="px-3 py-2 text-muted-foreground text-xs">Loading...</p>
            )}
            {status === 'error' && (
              <p className="px-3 py-2 text-destructive text-xs">
                Could not load options. Check the provider API key in plugin settings.
              </p>
            )}
            {status === 'idle' && filtered.length === 0 && (
              <p className="px-3 py-2 text-muted-foreground text-xs">
                {options.length === 0
                  ? 'Nothing available yet. Configure a provider in the plugin settings.'
                  : 'No matches'}
              </p>
            )}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-accent"
                onClick={() => {
                  capture('workflow.config_dynamic_option_picked', { field: name });
                  onChange(o.value);
                  setOpen(false);
                  setFilter('');
                }}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-sm">{o.label}</span>
                  {o.value === current && <Check className="size-3.5 shrink-0 text-primary" />}
                </span>
                <span className="flex items-center justify-between gap-2">
                  <code className="truncate font-mono text-[10px] text-muted-foreground">
                    {o.value}
                  </code>
                  {o.description && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {o.description}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="flex w-full items-center gap-1.5 border-t px-3 py-2 text-left text-muted-foreground text-xs hover:bg-accent hover:text-foreground"
            onClick={() => {
              setCustom(true);
              setOpen(false);
            }}
          >
            <PencilLine className="size-3" />
            {`Use a custom ${label.toLowerCase()}`}
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool-scoping multi-select (format:'tool-multiselect') - which tools the agent may call
// ─────────────────────────────────────────────────────────────────────────────

interface ToolRow {
  id: string;
  name: string;
  plugin: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

type LoadStatus = 'idle' | 'loading' | 'error';

/** Split qualified tool ids (`plugin:tool`) into rows grouped later by plugin. */
function toToolRows(tools: ToolSummary[]): ToolRow[] {
  return tools.map((t) => {
    const colon = t.id.indexOf(':');
    const plugin = colon > 0 ? t.id.slice(0, colon) : 'workspace';
    const local = colon > 0 ? t.id.slice(colon + 1) : t.id;
    return {
      id: t.id,
      name: t.name ?? local,
      plugin,
      description: t.description,
      inputSchema: t.inputSchema,
    };
  });
}

function groupByPlugin(rows: ToolRow[]): Array<[string, ToolRow[]]> {
  const groups = new Map<string, ToolRow[]>();
  for (const row of rows) {
    const list = groups.get(row.plugin) ?? [];
    list.push(row);
    groups.set(row.plugin, list);
  }
  return [...groups.entries()];
}

/** Fetch the live tool registry once, shared by every tool-aware field. */
function useToolRows(): { rows: ToolRow[]; status: LoadStatus } {
  const [rows, setRows] = useState<ToolRow[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    fetchTools()
      .then((tools) => {
        if (!cancelled) {
          setRows(toToolRows(tools));
          setStatus('idle');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { rows, status };
}

/** Read the input-argument names a tool accepts from its JSON-Schema. */
function toolArgNames(row: ToolRow | undefined): DynamicOption[] {
  const props = row?.inputSchema?.properties;
  if (typeof props !== 'object' || props === null) {
    return [];
  }
  return Object.entries(props).map(([name, raw]) => {
    const prop =
      typeof raw === 'object' && raw !== null ? Object.fromEntries(Object.entries(raw)) : {};
    const detail = typeof prop.description === 'string' ? prop.description : undefined;
    const kind = typeof prop.type === 'string' ? prop.type : undefined;
    return { value: name, label: name, description: detail ?? kind };
  });
}

/**
 * Multi-select over the live tool registry, grouped by plugin. The stored value
 * is an array of qualified tool ids; an empty array means "all workspace tools"
 * (the agent may call any registered tool), shown explicitly so it never reads
 * as "none selected".
 */
function ToolMultiSelectField({ value, onChange }: Readonly<ResolvedFieldInfo>) {
  const selected = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const { rows, status } = useToolRows();

  const allWorkspace = selected.length === 0;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  const needle = filter.trim().toLowerCase();
  const filtered = needle
    ? rows.filter((r) => `${r.name} ${r.id} ${r.description ?? ''}`.toLowerCase().includes(needle))
    : rows;

  return (
    <div className="space-y-2">
      {allWorkspace ? (
        <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-2.5 text-muted-foreground text-xs">
          <Wrench className="size-3.5 shrink-0" />
          All workspace tools (the agent may call any registered tool)
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <Badge key={id} variant="secondary" className="gap-1">
              {byId.get(id)?.name ?? id}
              <button
                type="button"
                className="rounded-sm opacity-70 hover:opacity-100"
                onClick={() => toggle(id)}
                title="Remove"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        className="w-full justify-between bg-background font-normal"
        onClick={() => setOpen(!open)}
      >
        <span>{allWorkspace ? 'Restrict to specific tools' : 'Edit tool access'}</span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </Button>

      {open && (
        <div className="overflow-hidden rounded-lg border bg-popover shadow-lg">
          <div className="border-b p-2">
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter tools"
              className="h-8 bg-background text-sm"
            />
          </div>
          <div className="max-h-[240px] overflow-y-auto">
            {status === 'loading' && (
              <p className="px-3 py-2 text-muted-foreground text-xs">Loading...</p>
            )}
            {status === 'error' && (
              <p className="px-3 py-2 text-destructive text-xs">Could not load tools.</p>
            )}
            {status === 'idle' && (
              <>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-accent"
                  onClick={() => onChange([])}
                >
                  <span className="font-medium text-sm">All workspace tools</span>
                  {allWorkspace && <Check className="size-3.5 shrink-0 text-primary" />}
                </button>
                {groupByPlugin(filtered).map(([plugin, group]) => (
                  <div key={plugin}>
                    <p className="bg-muted/50 px-3 py-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                      {plugin}
                    </p>
                    {group.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-accent"
                        onClick={() => toggle(row.id)}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium text-sm">{row.name}</span>
                          {selected.includes(row.id) && (
                            <Check className="size-3.5 shrink-0 text-primary" />
                          )}
                        </span>
                        {row.description && (
                          <span className="truncate text-[10px] text-muted-foreground">
                            {row.description}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Single-select tool picker (format:'tool-select') over the live registry,
 * grouped by plugin, with a custom-id escape hatch. Stores one qualified id.
 */
function ToolSelectField({ value, onChange, label }: Readonly<ResolvedFieldInfo>) {
  const current = toDisplayString(value);
  const { rows, status } = useToolRows();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [custom, setCustom] = useState(false);

  const selected = rows.find((r) => r.id === current);
  const needle = filter.trim().toLowerCase();
  const filtered = needle
    ? rows.filter((r) => `${r.name} ${r.id} ${r.description ?? ''}`.toLowerCase().includes(needle))
    : rows;

  if (custom) {
    return (
      <div className="space-y-1.5">
        <Input
          value={current}
          onChange={(e) => onChange(e.target.value)}
          placeholder="plugin:tool"
          className="bg-background font-mono text-sm"
        />
        <button
          type="button"
          className="text-muted-foreground text-xs hover:text-foreground"
          onClick={() => setCustom(false)}
        >
          Back to the list
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between bg-background font-normal"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">
          {selected?.name ?? (current || `Select a ${label.toLowerCase()}`)}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </Button>

      {open && (
        <div className="overflow-hidden rounded-lg border bg-popover shadow-lg">
          <div className="border-b p-2">
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter tools"
              className="h-8 bg-background text-sm"
            />
          </div>
          <div className="max-h-[240px] overflow-y-auto">
            {status === 'loading' && (
              <p className="px-3 py-2 text-muted-foreground text-xs">Loading...</p>
            )}
            {status === 'error' && (
              <p className="px-3 py-2 text-destructive text-xs">Could not load tools.</p>
            )}
            {status === 'idle' && filtered.length === 0 && (
              <p className="px-3 py-2 text-muted-foreground text-xs">No tools registered</p>
            )}
            {status === 'idle' &&
              groupByPlugin(filtered).map(([plugin, group]) => (
                <div key={plugin}>
                  <p className="bg-muted/50 px-3 py-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                    {plugin}
                  </p>
                  {group.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-accent"
                      onClick={() => {
                        onChange(row.id);
                        setOpen(false);
                        setFilter('');
                      }}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-sm">{row.name}</span>
                        {row.id === current && <Check className="size-3.5 shrink-0 text-primary" />}
                      </span>
                      {row.description && (
                        <span className="truncate text-[10px] text-muted-foreground">
                          {row.description}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
          </div>
          <button
            type="button"
            className="flex w-full items-center gap-1.5 border-t px-3 py-2 text-left text-muted-foreground text-xs hover:bg-accent hover:text-foreground"
            onClick={() => {
              setCustom(true);
              setOpen(false);
            }}
          >
            <PencilLine className="size-3" />
            Use a custom tool id
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Argument-name picker (format:'tool-arg-select') for the Call Tool block. Reads
 * the input-argument names from the sibling `tool`'s JSON-Schema so the user
 * picks which argument the input feeds. Falls back to a free-text input while
 * loading, when no tool is chosen, or when the tool declares no arguments.
 */
function ToolArgField({ value, onChange, label, allConfig }: Readonly<ResolvedFieldInfo>) {
  const current = toDisplayString(value);
  const { rows, status } = useToolRows();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);

  const toolId = typeof allConfig?.tool === 'string' ? allConfig.tool : '';
  const options = toolArgNames(rows.find((r) => r.id === toolId));

  if (custom || status !== 'idle' || options.length === 0) {
    return (
      <div className="space-y-1.5">
        <Input
          value={current}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Enter the ${label.toLowerCase()}`}
          className="bg-background font-mono text-sm"
        />
        {custom && options.length > 0 && (
          <button
            type="button"
            className="text-muted-foreground text-xs hover:text-foreground"
            onClick={() => setCustom(false)}
          >
            Back to the list
          </button>
        )}
      </div>
    );
  }

  const selected = options.find((o) => o.value === current);
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between bg-background font-normal"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">
          {selected?.label ?? (current || `Select an ${label.toLowerCase()}`)}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </Button>
      {open && (
        <div className="overflow-hidden rounded-lg border bg-popover shadow-lg">
          <div className="max-h-[220px] overflow-y-auto">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-accent"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <span className="flex items-center justify-between gap-2">
                  <code className="truncate font-mono text-sm">{o.value}</code>
                  {o.value === current && <Check className="size-3.5 shrink-0 text-primary" />}
                </span>
                {o.description && (
                  <span className="truncate text-[10px] text-muted-foreground">
                    {o.description}
                  </span>
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="flex w-full items-center gap-1.5 border-t px-3 py-2 text-left text-muted-foreground text-xs hover:bg-accent hover:text-foreground"
            onClick={() => {
              setCustom(true);
              setOpen(false);
            }}
          >
            <PencilLine className="size-3" />
            Use a custom argument name
          </button>
        </div>
      )}
    </div>
  );
}

/** Map from type-marker to the corresponding renderer */
const markerRenderers: Record<TypeMarker, (info: ResolvedFieldInfo) => ReactNode> = {
  duration: (info) => <DurationField {...info} />,
  color: (info) => <ColorField {...info} />,
  expression: (info) => <ExpressionMarkerField {...info} />,
  secret: (info) => <SecretField {...info} />,
  url: (info) => <StringField {...info} />,
  json: (info) => <StringField {...info} />,
  code: (info) => <StringField {...info} />,
};

function resolveFieldInfo(
  props: Readonly<FieldProps>,
  label: string,
  cleanDescription: string | undefined
): ResolvedFieldInfo {
  return {
    label,
    cleanDescription,
    value: props.value,
    onChange: props.onChange,
    variables: props.variables,
    defaultValue: props.schema.default,
    name: props.name,
    blockType: props.blockType,
    allConfig: props.allConfig,
  };
}

function renderFieldControl(
  info: ResolvedFieldInfo,
  schema: SchemaProperty,
  typeMarker: TypeMarker | null
): ReactNode {
  if (typeMarker) {
    const renderer = markerRenderers[typeMarker];
    return renderer(info);
  }

  if (schema.format === 'dynamic-dropdown') {
    return <DynamicSelectField {...info} />;
  }

  if (schema.format === 'tool-multiselect') {
    return <ToolMultiSelectField {...info} />;
  }

  if (schema.format === 'tool-select') {
    return <ToolSelectField {...info} />;
  }

  if (schema.format === 'tool-arg-select') {
    return <ToolArgField {...info} />;
  }

  if (schema.type === 'boolean') {
    return <BooleanField {...info} />;
  }

  if (schema.enum && schema.enum.length > 0) {
    return <EnumField {...info} enumValues={schema.enum} />;
  }

  if (schema.type === 'object') {
    return <ObjectField {...info} />;
  }

  if (schema.type === 'number') {
    return <NumberField {...info} />;
  }

  return <StringField {...info} />;
}

function SchemaField(props: Readonly<FieldProps>) {
  const { name, schema, pluginId } = props;
  const { tp } = useLocale();
  const description = schema.description;

  // Check for special type markers
  const { marker: typeMarker } = getTypeMarker(description);

  // Clean description (remove type marker) - used as fallback
  const fallbackDescription = description?.replaceAll(/\$type:\w+(:\w+)?/g, '').trim();

  // Pretty label: prefer an explicit meta label, else humanize the camelCase key.
  const fallbackLabel =
    schema.label ??
    name
      .replaceAll(/([A-Z])/g, ' $1')
      .replace(/^./, (s) => s.toUpperCase())
      .trim();

  // Translate field label and description using plugin's fields translations
  const label = pluginId ? tp(pluginId, `fields.${name}.label`, fallbackLabel) : fallbackLabel;
  const cleanDescription = pluginId
    ? tp(pluginId, `fields.${name}.description`, fallbackDescription ?? '')
    : fallbackDescription;

  const info = resolveFieldInfo(props, label, cleanDescription);
  const fieldControl = renderFieldControl(info, schema, typeMarker);

  // Boolean fields render their own container
  if (schema.type === 'boolean') {
    return fieldControl;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label className="font-medium text-sm">{label}</Label>
        {props.required && <span className="text-destructive text-xs">*</span>}
        {cleanDescription && (
          <HelpCircle className="size-3.5 text-muted-foreground" aria-label={cleanDescription} />
        )}
      </div>
      {fieldControl}
      {cleanDescription && <p className="text-muted-foreground text-xs">{cleanDescription}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Duration Input
// ─────────────────────────────────────────────────────────────────────────────

interface DurationInputProps {
  value: number | undefined;
  onChange: (value: number) => void;
  placeholder?: string;
}

type DurationUnit = 'ms' | 's' | 'm' | 'h';

const durationUnits = new Set<string>(['ms', 's', 'm', 'h']);

function isDurationUnit(v: string): v is DurationUnit {
  return durationUnits.has(v);
}

function DurationInput({ value, onChange, placeholder }: Readonly<DurationInputProps>) {
  // Convert ms to display value based on unit
  const [unit, setUnit] = useState<DurationUnit>(() => {
    if (!value) {
      return 'ms';
    }
    if (value >= 3600000) {
      return 'h';
    }
    if (value >= 60000) {
      return 'm';
    }
    if (value >= 1000) {
      return 's';
    }
    return 'ms';
  });

  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60000,
    h: 3600000,
  };

  const displayValue = value === undefined ? '' : value / multipliers[unit];

  const handleValueChange = (inputValue: string) => {
    const num = Number(inputValue);
    if (!Number.isNaN(num)) {
      onChange(Math.round(num * multipliers[unit]));
    }
  };

  const handleUnitChange = (newUnit: DurationUnit) => {
    setUnit(newUnit);
    // Recalculate value with new unit
    if (value !== undefined) {
      onChange(value); // Keep the same ms value
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        value={displayValue}
        onChange={(e) => handleValueChange(e.target.value)}
        placeholder={placeholder || '0'}
        className="flex-1 bg-background"
        min={0}
      />
      <Select
        value={unit}
        onValueChange={(v) => {
          if (isDurationUnit(v)) {
            handleUnitChange(v);
          }
        }}
      >
        <SelectTrigger className="w-20 bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ms">ms</SelectItem>
          <SelectItem value="s">sec</SelectItem>
          <SelectItem value="m">min</SelectItem>
          <SelectItem value="h">hour</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Config (Schema-Driven)
// ─────────────────────────────────────────────────────────────────────────────

function BlockConfig({
  data,
  schema,
  onUpdate,
  availableVariables,
  pluginId,
}: Readonly<{
  data: BlockNodeData;
  schema?: BlockSchema;
  onUpdate: (config: Record<string, unknown>) => void;
  availableVariables: Variable[];
  pluginId?: string;
}>) {
  const config = data.config;

  const { t } = useLocale();

  // If no schema properties, show empty state
  if (!schema?.properties || Object.keys(schema.properties).length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <p className="text-sm">{t('workflows:editor.panels.noConfigNeeded')}</p>
        <p className="mt-1 text-xs">{t('workflows:editor.panels.defaultSettings')}</p>
      </div>
    );
  }

  // Render form fields from schema, skipping any whose showWhen condition is unmet.
  const properties = schema.properties;
  const requiredFields = new Set(schema.required ?? []);
  const visibleFields = Object.entries(properties).filter(([, fieldSchema]) => {
    const { showWhen } = toSchemaProperty(fieldSchema);
    return !showWhen || showWhenSatisfied(config[showWhen.field], showWhen.equals);
  });

  return (
    <div className="space-y-4">
      {visibleFields.map(([name, fieldSchema]) => (
        <SchemaField
          key={name}
          name={name}
          schema={toSchemaProperty(fieldSchema)}
          value={config[name]}
          onChange={(value) =>
            onUpdate({
              ...config,
              [name]: value,
            })
          }
          variables={availableVariables}
          required={requiredFields.has(name)}
          pluginId={pluginId}
          blockType={data.type}
          allConfig={config}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Config Panel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safely extract BlockNodeData from Node.data.
 * BlockNodeData's index signature `[key: string]: unknown` makes it
 * structurally compatible with `Record<string, unknown>`, so spreading
 * preserves all runtime values while satisfying the type system.
 */
function toBlockData(data: Record<string, unknown>): BlockNodeData {
  const id = typeof data.id === 'string' ? data.id : '';
  const type = typeof data.type === 'string' ? data.type : '';
  const label = typeof data.label === 'string' ? data.label : '';
  const config =
    typeof data.config === 'object' && data.config !== null ? toRecord(data.config) : {};

  // BlockNodeData has [key: string]: unknown, so we build the base object
  // with validated required fields and spread the rest for optional fields
  // (inputs, outputs, status, icon, color, pluginId, output, etc.)
  const base: BlockNodeData = {
    ...data,
    id,
    type,
    label,
    config,
  };
  return base;
}

interface PortListProps {
  ports: BlockPort[];
  nodeId: string;
  icon: ReactNode;
  label: string;
  colorClasses: {
    iconColor: string;
    badgeBorder: string;
    badgeBg: string;
    badgeText: string;
  };
}

function PortTypeBadge({
  nodeId,
  port,
  colorClasses,
}: Readonly<{
  nodeId: string;
  port: BlockPort;
  colorClasses: PortListProps['colorClasses'];
}>) {
  const resolvedType = usePortTypeName(nodeId, port.id);
  const typeLabel = resolvedType ?? displayType(parsePortType(port));
  return (
    <Badge
      variant="outline"
      className={cn(
        'h-5 max-w-28 truncate font-mono text-[10px]',
        colorClasses.badgeBorder,
        colorClasses.badgeBg,
        colorClasses.badgeText
      )}
      title={typeLabel}
    >
      {typeLabel}
    </Badge>
  );
}

function PortList({ ports, nodeId, icon, label, colorClasses }: Readonly<PortListProps>) {
  if (ports.length === 0) {
    return null;
  }
  return (
    <div className="rounded-lg bg-muted/30 p-2.5">
      <div className="mb-2 flex items-center gap-1.5">
        {icon}
        <span className="font-medium text-muted-foreground text-xs">{label}</span>
      </div>
      <div className="space-y-1.5">
        {ports.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-md bg-background/60 px-2.5 py-1.5"
          >
            <span className="font-medium text-foreground text-xs">{p.name}</span>
            <PortTypeBadge nodeId={nodeId} port={p} colorClasses={colorClasses} />
          </div>
        ))}
      </div>
    </div>
  );
}

interface IOTypesSectionProps {
  nodeId: string;
  inputs: BlockPort[];
  outputs: BlockPort[];
}

function IOTypesSection({ nodeId, inputs, outputs }: Readonly<IOTypesSectionProps>) {
  const hasInputs = inputs.length > 0;
  const hasOutputs = outputs.length > 0;

  if (!hasInputs && !hasOutputs) {
    return null;
  }

  return (
    <div className="mt-3 grid gap-2 border-t pt-3">
      <PortList
        ports={inputs}
        nodeId={nodeId}
        icon={<ArrowDownToLine className="size-3.5 text-blue-500" />}
        label="Inputs"
        colorClasses={{
          iconColor: 'text-blue-500',
          badgeBorder: 'border-blue-500/30',
          badgeBg: 'bg-blue-500/10',
          badgeText: 'text-blue-600 dark:text-blue-400',
        }}
      />
      <PortList
        ports={outputs}
        nodeId={nodeId}
        icon={<ArrowUpFromLine className="size-3.5 text-orange-500" />}
        label="Outputs"
        colorClasses={{
          iconColor: 'text-orange-500',
          badgeBorder: 'border-orange-500/30',
          badgeBg: 'bg-orange-500/10',
          badgeText: 'text-orange-600 dark:text-orange-400',
        }}
      />
    </div>
  );
}

interface ConfigPanelHeaderProps {
  nodeId: string;
  blockData: BlockNodeData;
  displayLabel: string;
  onCollapse?: () => void;
}

function ConfigPanelHeader({
  nodeId,
  blockData,
  displayLabel,
  onCollapse,
}: Readonly<ConfigPanelHeaderProps>) {
  const { t } = useLocale();

  return (
    <div className="border-b bg-background/80 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {blockData.color && (
            <div
              className="flex size-9 items-center justify-center rounded-lg"
              style={{
                backgroundColor: `${blockData.color}20`,
              }}
            >
              <div
                className="size-3.5 rounded-full"
                style={{
                  backgroundColor: blockData.color,
                }}
              />
            </div>
          )}
          <div>
            <h3 className="font-semibold text-sm">{displayLabel}</h3>
            <p className="mt-0.5 text-muted-foreground text-xs">
              {t('workflows:editor.panels.config')}
            </p>
          </div>
        </div>
        {onCollapse && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                onClick={onCollapse}
              >
                <ChevronRight className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>{t('workflows:editor.panels.collapse')}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <IOTypesSection
        nodeId={nodeId}
        inputs={blockData.inputs ?? []}
        outputs={blockData.outputs ?? []}
      />
    </div>
  );
}

interface VariablesReferenceProps {
  variables: Variable[];
}

function VariablesReference({ variables }: Readonly<VariablesReferenceProps>) {
  const { t } = useLocale();
  const capture = useCapture();

  if (variables.length === 0) {
    return null;
  }

  return (
    <>
      <Separator />
      <div className="p-4">
        <div className="mb-3 flex items-center gap-2 font-medium text-muted-foreground text-xs">
          <Sparkles className="size-4" />
          {t('workflows:editor.panels.availableVariables')}
        </div>
        <div className="grid gap-1.5">
          {variables.map((v) => (
            <button
              type="button"
              key={v.name}
              className="flex w-full cursor-pointer flex-col gap-1 rounded-md border-none bg-muted/50 p-2 text-left font-inherit text-xs transition-colors hover:bg-muted"
              onClick={() => {
                capture('workflow.config_variable_copied', { surface: 'reference_list' });
                navigator.clipboard.writeText(`{{ ${v.name} }}`);
              }}
              title={t('workflows:editor.panels.clickToCopy')}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <code className="font-mono text-primary">{`{{ ${v.name} }}`}</code>
                <Badge variant="outline" className="h-5 text-[10px]">
                  {v.type}
                </Badge>
              </div>
              {v.preview !== undefined && (
                <span className="truncate font-mono text-[10px] text-muted-foreground">
                  {v.preview}
                </span>
              )}
            </button>
          ))}
        </div>
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          {t('workflows:editor.panels.clickToCopy')}
        </p>
      </div>
    </>
  );
}

export function ConfigPanel({
  node,
  onUpdateBlock,
  availableVariables,
  blockSchema,
  viewModuleUrl,
  pluginUid,
  onCollapse,
  className,
}: Readonly<ConfigPanelProps>) {
  const { t, tp } = useLocale();
  const blockData = toBlockData(node.data);

  // Translate block label if pluginId is available
  const blockType = blockData.type || '';
  const blockKey = blockType.split(':').pop() ?? blockType;
  const displayLabel = blockData.pluginId
    ? tp(blockData.pluginId, `blocks.${blockKey}.name`, blockData.label || blockData.id)
    : blockData.label || blockData.id;

  return (
    <div className={cn('flex h-full flex-col border-l bg-card/50 backdrop-blur-sm', className)}>
      <ConfigPanelHeader
        nodeId={node.id}
        blockData={blockData}
        displayLabel={displayLabel}
        onCollapse={onCollapse}
      />

      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        <div className="p-4">
          {viewModuleUrl && pluginUid && blockData.pluginId ? (
            <ClientBlockView
              blockId={node.id}
              blockType={blockType}
              pluginName={blockData.pluginId}
              pluginUid={pluginUid}
              moduleUrl={viewModuleUrl}
              scopeId={`${blockData.pluginId}:blocks/${blockKey}.view`}
              config={blockData.config}
              variables={availableVariables}
              onUpdateConfig={(config) => onUpdateBlock(node.id, config)}
            />
          ) : (
            <BlockConfig
              data={blockData}
              schema={blockSchema}
              onUpdate={(config) => onUpdateBlock(node.id, config)}
              availableVariables={availableVariables}
              pluginId={blockData.pluginId}
            />
          )}
        </div>

        <VariablesReference variables={availableVariables} />
      </ScrollArea>

      <div className="border-t bg-background/80 p-3 text-center text-muted-foreground text-xs">
        {t('workflows:editor.panels.nodeId')}: <code className="font-mono">{node.id}</code>
      </div>
    </div>
  );
}
