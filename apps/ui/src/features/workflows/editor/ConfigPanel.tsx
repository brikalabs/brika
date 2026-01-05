/**
 * Config Panel
 *
 * Smart schema-driven configuration panel for blocks.
 * Generates appropriate UI controls based on field types.
 */

import type { Node } from '@xyflow/react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  HelpCircle,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import React, { useState } from 'react';
import {
  Badge,
  Button,
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
} from '@/components/ui';
import { cn } from '@/lib/utils';
import type { BlockNodeData } from './BlockNode';
import type { TriggerNodeData } from './TriggerNode';

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
  onUpdateTrigger: (config: { event?: string; filter?: Record<string, unknown> }) => void;
  availableVariables: Variable[];
  blockSchema?: BlockSchema;
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
}: ExpressionFieldProps) {
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
                    <Check className="size-3 text-green-500" />
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
}: KeyValueEditorProps) {
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
      {entries.map(([k, v], i) => (
        <div key={i} className="flex items-start gap-2">
          <Input
            value={k}
            onChange={(e) => updateKey(k, e.target.value)}
            placeholder={keyPlaceholder}
            className="flex-1 font-mono text-xs"
          />
          <div className="flex-[2]">
            <ExpressionField
              value={String(v ?? '')}
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
}

function SchemaField({ name, schema, value, onChange, variables, required }: FieldProps) {
  const type = schema.type;
  const description = schema.description;
  const enumValues = schema.enum;
  const defaultValue = schema.default;

  // Pretty label from camelCase
  const label = name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();

  // Determine field type and render appropriate control
  const renderField = () => {
    // Boolean - Switch
    if (type === 'boolean') {
      return (
        <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
          <div>
            <span className="font-medium text-sm">{label}</span>
            {description && <p className="mt-0.5 text-muted-foreground text-xs">{description}</p>}
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
        <Select value={String(value ?? defaultValue ?? '')} onValueChange={(v) => onChange(v)}>
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
          value={String(value ?? defaultValue ?? '')}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
          placeholder={description || `Enter ${label.toLowerCase()}`}
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
      description?.toLowerCase().includes('expression') ||
      description?.toLowerCase().includes('condition');

    return (
      <ExpressionField
        value={String(value ?? '')}
        onChange={(v) => onChange(v)}
        variables={variables}
        placeholder={description || `Enter ${label.toLowerCase()}`}
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
        {required && <span className="text-red-500 text-xs">*</span>}
        {description && (
          <HelpCircle className="size-3.5 text-muted-foreground" aria-label={description} />
        )}
      </div>
      {renderField()}
      {description && <p className="text-muted-foreground text-xs">{description}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Trigger Config
// ─────────────────────────────────────────────────────────────────────────────

function TriggerConfig({
  data,
  onUpdate,
}: {
  data: TriggerNodeData;
  onUpdate: (config: { event?: string; filter?: Record<string, unknown> }) => void;
}) {
  const [showFilter, setShowFilter] = useState(
    !!data.filter && Object.keys(data.filter).length > 0
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="font-medium text-sm">Event Pattern</Label>
        <Input
          value={data.event}
          onChange={(e) => onUpdate({ event: e.target.value })}
          placeholder="sensor.*, timer.completed"
          className="bg-background font-mono"
        />
        <p className="text-muted-foreground text-xs">
          Use <code className="rounded bg-muted px-1">*</code> as wildcard
        </p>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          className="flex items-center gap-2 font-medium text-muted-foreground text-sm hover:text-foreground"
          onClick={() => setShowFilter(!showFilter)}
        >
          {showFilter ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          Filter (optional)
        </button>

        {showFilter && (
          <div className="space-y-2 border-muted border-l-2 pl-4">
            <p className="text-muted-foreground text-xs">
              Only trigger when payload matches these conditions
            </p>
            <KeyValueEditor
              value={data.filter || {}}
              onChange={(filter) => onUpdate({ filter })}
              variables={[]}
              keyPlaceholder="field"
              valuePlaceholder="expected value"
            />
          </div>
        )}
      </div>
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
}: {
  data: BlockNodeData;
  schema?: BlockSchema;
  onUpdate: (config: Record<string, unknown>) => void;
  availableVariables: Variable[];
}) {
  const config = data.config;

  // If no schema properties, show empty state
  if (!schema?.properties || Object.keys(schema.properties).length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <p className="text-sm">No configuration needed</p>
        <p className="mt-1 text-xs">This block works with default settings</p>
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
  onUpdateTrigger,
  availableVariables,
  blockSchema,
  className,
}: ConfigPanelProps) {
  const isTrigger = node.type === 'trigger';
  const data = node.data as unknown as BlockNodeData | TriggerNodeData;
  const blockData = data as BlockNodeData;

  return (
    <div className={cn('flex h-full flex-col border-l bg-card/50 backdrop-blur-sm', className)}>
      {/* Header */}
      <div className="border-b bg-background/80 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">
              {isTrigger ? 'Trigger Configuration' : blockData.label}
            </h3>
            <p className="mt-0.5 text-muted-foreground text-xs">
              {isTrigger
                ? 'When this event occurs'
                : `Configure ${(blockData.type || '').split(':').pop()} block`}
            </p>
          </div>
          {!isTrigger && blockData.color && (
            <div
              className="flex size-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: blockData.color + '20' }}
            >
              <div className="size-3 rounded-full" style={{ backgroundColor: blockData.color }} />
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {isTrigger ? (
            <TriggerConfig data={data as TriggerNodeData} onUpdate={onUpdateTrigger} />
          ) : (
            <BlockConfig
              data={data as BlockNodeData}
              schema={blockSchema}
              onUpdate={(config) => onUpdateBlock(node.id, config)}
              availableVariables={availableVariables}
            />
          )}
        </div>

        {/* Variables Reference */}
        {!isTrigger && availableVariables.length > 0 && (
          <>
            <Separator />
            <div className="p-4">
              <div className="mb-3 flex items-center gap-2 font-medium text-muted-foreground text-xs">
                <Sparkles className="size-4" />
                Available Variables
              </div>
              <div className="grid gap-1.5">
                {availableVariables.map((v) => (
                  <div
                    key={v.name}
                    className="flex cursor-pointer items-center justify-between rounded-md bg-muted/50 p-2 text-xs transition-colors hover:bg-muted"
                    onClick={() => navigator.clipboard.writeText(`{{ ${v.name} }}`)}
                    title="Click to copy"
                  >
                    <code className="font-mono text-primary">{`{{ ${v.name} }}`}</code>
                    <Badge variant="outline" className="h-5 text-[10px]">
                      {v.type}
                    </Badge>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-center text-[10px] text-muted-foreground">
                Click to copy · Use in any text field
              </p>
            </div>
          </>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="border-t bg-background/80 p-3 text-center text-muted-foreground text-xs">
        Node ID: <code className="font-mono">{node.id}</code>
      </div>
    </div>
  );
}
