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

import { useQuery } from '@tanstack/react-query';
import type { Node } from '@xyflow/react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronRight,
  Copy,
  HelpCircle,
  Plus,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Input,
  Label,
  ScrollArea,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Separator,
  Switch,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui';
import { fetcher } from '@/lib/query';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import type { BlockNodeData } from './BlockNode';

// ─────────────────────────────────────────────────────────────────────────────
// Type Markers
// ─────────────────────────────────────────────────────────────────────────────

type TypeMarker =
  | 'expression'
  | 'duration'
  | 'color'
  | 'code'
  | 'secret'
  | 'url'
  | 'json'
  | 'spark';

function getTypeMarker(description?: string): { marker: TypeMarker | null; extra?: string } {
  if (!description) return { marker: null };

  const markers: TypeMarker[] = [
    'expression',
    'duration',
    'color',
    'code',
    'secret',
    'url',
    'json',
    'spark',
  ];
  for (const marker of markers) {
    if (description.includes(`$type:${marker}`)) {
      // Extract extra info after colon (e.g., $type:code:javascript)
      const match = new RegExp(String.raw`\$type:${marker}:?(\w+)?`).exec(description);
      return { marker, extra: match?.[1] };
    }
  }
  return { marker: null };
}

/**
 * Safely convert a value to string, handling objects and nullish values
 */
function toDisplayString(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Variable {
  name: string;
  source: string;
  type: string;
}

interface SchemaProperty {
  type: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
}

interface BlockSchema {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
}

interface ConfigPanelProps {
  node: Node;
  onUpdateBlock: (nodeId: string, config: Record<string, unknown>) => void;
  availableVariables: Variable[];
  blockSchema?: BlockSchema;
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
  const [showVars, setShowVars] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const insertVariable = (varName: string) => {
    const expr = `{{ ${varName} }}`;
    onChange(value + expr);
    setShowVars(false);
  };

  const copyVariable = (varName: string) => {
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
          onClick={() => setShowVars(!showVars)}
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
                  className="flex flex-1 items-center gap-2 text-left"
                  onClick={() => insertVariable(v.name)}
                >
                  <code className="font-mono text-primary text-xs">{`{{ ${v.name} }}`}</code>
                  <span className="text-muted-foreground text-xs">{v.type}</span>
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
  const entries = Object.entries(value || {});

  const addEntry = () => {
    const newKey = `key${entries.length + 1}`;
    onChange({ ...value, [newKey]: '' });
  };

  const removeEntry = (key: string) => {
    const newValue = { ...value };
    delete newValue[key];
    onChange(newValue);
  };

  const updateKey = (oldKey: string, newKey: string) => {
    if (oldKey === newKey) return;
    const newValue: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      newValue[k === oldKey ? newKey : k] = v;
    }
    onChange(newValue);
  };

  const updateValue = (key: string, newVal: unknown) => {
    onChange({ ...value, [key]: newVal });
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
}

function SchemaField({
  name,
  schema,
  value,
  onChange,
  variables,
  required,
  pluginId,
}: Readonly<FieldProps>) {
  const { tp } = useLocale();
  const type = schema.type;
  const description = schema.description;
  const enumValues = schema.enum;
  const defaultValue = schema.default;

  // Check for special type markers
  const { marker: typeMarker } = getTypeMarker(description);

  // Clean description (remove type marker) - used as fallback
  const fallbackDescription = description?.replaceAll(/\$type:\w+(:\w+)?/g, '').trim();

  // Pretty label from camelCase (fallback)
  const fallbackLabel = name
    .replaceAll(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();

  // Translate field label and description using plugin's fields translations
  const label = pluginId ? tp(pluginId, `fields.${name}.label`, fallbackLabel) : fallbackLabel;
  const cleanDescription = pluginId
    ? tp(pluginId, `fields.${name}.description`, fallbackDescription ?? '')
    : fallbackDescription;

  // Determine field type and render appropriate control
  const renderField = () => {
    // Special type: Duration (ms)
    if (typeMarker === 'duration') {
      return (
        <DurationInput
          value={value as number | undefined}
          onChange={onChange}
          placeholder={cleanDescription || `Enter ${label.toLowerCase()}`}
        />
      );
    }

    // Special type: Color
    if (typeMarker === 'color') {
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

    // Special type: Expression
    if (typeMarker === 'expression') {
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

    // Special type: Secret
    if (typeMarker === 'secret') {
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

    // Special type: Spark (autocomplete for spark types)
    if (typeMarker === 'spark') {
      return (
        <SparkTypeInput
          value={toDisplayString(value)}
          onChange={(v) => onChange(v)}
          placeholder={cleanDescription || 'Select spark type...'}
        />
      );
    }

    // Boolean - Switch
    if (type === 'boolean') {
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

    // Enum - Select dropdown
    if (enumValues && enumValues.length > 0) {
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

    // Object - Key-Value Editor
    if (type === 'object') {
      const objValue =
        typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
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

    // Number
    if (type === 'number') {
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

    // String - Expression input with variable support
    // Determine if multiline based on field name or description
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
  };

  // Boolean fields render their own container
  if (type === 'boolean') {
    return renderField();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label className="font-medium text-sm">{label}</Label>
        {required && <span className="text-destructive text-xs">*</span>}
        {cleanDescription && (
          <HelpCircle className="size-3.5 text-muted-foreground" aria-label={cleanDescription} />
        )}
      </div>
      {renderField()}
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

function DurationInput({ value, onChange, placeholder }: Readonly<DurationInputProps>) {
  // Convert ms to display value based on unit
  type DurationUnit = 'ms' | 's' | 'm' | 'h';

  const [unit, setUnit] = useState<DurationUnit>(() => {
    if (!value) return 'ms';
    if (value >= 3600000) return 'h';
    if (value >= 60000) return 'm';
    if (value >= 1000) return 's';
    return 'ms';
  });

  const multipliers = { ms: 1, s: 1000, m: 60000, h: 3600000 };

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
      <Select value={unit} onValueChange={(v) => handleUnitChange(v as DurationUnit)}>
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
// Spark Type Input with Autocomplete
// ─────────────────────────────────────────────────────────────────────────────

interface RegisteredSpark {
  type: string;
  id: string;
  pluginId: string;
  name?: string;
  description?: string;
  schema?: Record<string, unknown>;
}

interface SparkTypeInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function SparkTypeInput({ value, onChange, placeholder }: Readonly<SparkTypeInputProps>) {
  const { data: sparks = [] } = useQuery({
    queryKey: ['sparks'],
    queryFn: () => fetcher<RegisteredSpark[]>('/api/sparks'),
    staleTime: 30000,
  });

  // Group sparks by plugin
  const sparksByPlugin = useMemo(() => {
    const grouped = new Map<string, RegisteredSpark[]>();
    for (const spark of sparks) {
      const existing = grouped.get(spark.pluginId) || [];
      grouped.set(spark.pluginId, [...existing, spark]);
    }
    return grouped;
  }, [sparks]);

  if (sparks.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-muted-foreground text-sm">
        <Zap className="size-4" />
        <span>No sparks registered</span>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="bg-background">
        <SelectValue placeholder={placeholder || 'Select spark type...'}>
          {value && (
            <span className="flex items-center gap-2">
              <Zap className="size-4 text-amber-500" />
              <span className="font-mono">{value}</span>
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {[...sparksByPlugin.entries()].map(([pluginId, pluginSparks]) => (
          <SelectGroup key={pluginId}>
            <SelectLabel className="font-mono text-xs">{pluginId}</SelectLabel>
            {pluginSparks.map((spark) => (
              <SelectItem key={spark.type} value={spark.type}>
                <span className="flex items-center gap-2">
                  <Zap className="size-3 text-amber-500" />
                  <span>{spark.name || spark.id}</span>
                  <span className="font-mono text-muted-foreground text-xs">({spark.type})</span>
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Trigger Config
// ─────────────────────────────────────────────────────────────────────────────

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

  // Render form fields from schema
  const properties = schema.properties;
  const requiredFields = new Set(schema.required ?? []);

  return (
    <div className="space-y-4">
      {Object.entries(properties).map(([name, fieldSchema]) => (
        <SchemaField
          key={name}
          name={name}
          schema={fieldSchema as SchemaProperty}
          value={config[name]}
          onChange={(value) => onUpdate({ ...config, [name]: value })}
          variables={availableVariables}
          required={requiredFields.has(name)}
          pluginId={pluginId}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Config Panel
// ─────────────────────────────────────────────────────────────────────────────

export function ConfigPanel({
  node,
  onUpdateBlock,
  availableVariables,
  blockSchema,
  onCollapse,
  className,
}: Readonly<ConfigPanelProps>) {
  const { t, tp } = useLocale();
  const blockData = node.data as unknown as BlockNodeData;

  // Translate block label if pluginId is available
  const blockType = blockData.type || '';
  const blockKey = blockType.split(':').pop() || blockType;
  const displayLabel = blockData.pluginId
    ? tp(blockData.pluginId, `blocks.${blockKey}.name`, blockData.label || blockData.id)
    : blockData.label || blockData.id;

  return (
    <div className={cn('flex h-full flex-col border-l bg-card/50 backdrop-blur-sm', className)}>
      {/* Header */}
      <div className="border-b bg-background/80 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {blockData.color && (
              <div
                className="flex size-9 items-center justify-center rounded-lg"
                style={{ backgroundColor: blockData.color + '20' }}
              >
                <div
                  className="size-3.5 rounded-full"
                  style={{ backgroundColor: blockData.color }}
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

        {/* I/O Types - Improved display */}
        {((blockData.inputs?.length ?? 0) > 0 || (blockData.outputs?.length ?? 0) > 0) && (
          <div className="mt-3 grid gap-2 border-t pt-3">
            {(blockData.inputs?.length ?? 0) > 0 && (
              <div className="rounded-lg bg-muted/30 p-2.5">
                <div className="mb-2 flex items-center gap-1.5">
                  <ArrowDownToLine className="size-3.5 text-blue-500" />
                  <span className="font-medium text-muted-foreground text-xs">Inputs</span>
                </div>
                <div className="space-y-1.5">
                  {blockData.inputs?.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-md bg-background/60 px-2.5 py-1.5"
                    >
                      <span className="font-medium text-foreground text-xs">{p.name}</span>
                      <Badge
                        variant="outline"
                        className="h-5 border-blue-500/30 bg-blue-500/10 font-mono text-[10px] text-blue-600 dark:text-blue-400"
                      >
                        {p.typeName ?? 'any'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(blockData.outputs?.length ?? 0) > 0 && (
              <div className="rounded-lg bg-muted/30 p-2.5">
                <div className="mb-2 flex items-center gap-1.5">
                  <ArrowUpFromLine className="size-3.5 text-orange-500" />
                  <span className="font-medium text-muted-foreground text-xs">Outputs</span>
                </div>
                <div className="space-y-1.5">
                  {blockData.outputs?.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-md bg-background/60 px-2.5 py-1.5"
                    >
                      <span className="font-medium text-foreground text-xs">{p.name}</span>
                      <Badge
                        variant="outline"
                        className="h-5 border-orange-500/30 bg-orange-500/10 font-mono text-[10px] text-orange-600 dark:text-orange-400"
                      >
                        {p.typeName ?? 'any'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          <BlockConfig
            data={blockData}
            schema={blockSchema}
            onUpdate={(config) => onUpdateBlock(node.id, config)}
            availableVariables={availableVariables}
            pluginId={blockData.pluginId}
          />
        </div>

        {/* Variables Reference */}
        {availableVariables.length > 0 && (
          <>
            <Separator />
            <div className="p-4">
              <div className="mb-3 flex items-center gap-2 font-medium text-muted-foreground text-xs">
                <Sparkles className="size-4" />
                {t('workflows:editor.panels.availableVariables')}
              </div>
              <div className="grid gap-1.5">
                {availableVariables.map((v) => (
                  <button
                    type="button"
                    key={v.name}
                    className="flex w-full cursor-pointer items-center justify-between rounded-md bg-muted/50 p-2 text-xs transition-colors hover:bg-muted border-none text-left font-inherit"
                    onClick={() => navigator.clipboard.writeText(`{{ ${v.name} }}`)}
                    title={t('workflows:editor.panels.clickToCopy')}
                  >
                    <code className="font-mono text-primary">{`{{ ${v.name} }}`}</code>
                    <Badge variant="outline" className="h-5 text-[10px]">
                      {v.type}
                    </Badge>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-center text-[10px] text-muted-foreground">
                {t('workflows:editor.panels.clickToCopy')}
              </p>
            </div>
          </>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="border-t bg-background/80 p-3 text-center text-muted-foreground text-xs">
        {t('workflows:editor.panels.nodeId')}: <code className="font-mono">{node.id}</code>
      </div>
    </div>
  );
}
