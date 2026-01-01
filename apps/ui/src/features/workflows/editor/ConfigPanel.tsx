/**
 * Config Panel
 * 
 * Smart schema-driven configuration panel for blocks.
 * Generates appropriate UI controls based on field types.
 */

import React, { useState } from "react";
import type { Node } from "@xyflow/react";
import {
  Card, CardContent, CardHeader, CardTitle,
  Input, Label, Textarea,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  ScrollArea, Separator, Badge, Button, Switch,
} from "@/components/ui";
import { 
  Info, HelpCircle, Plus, Trash2, ChevronDown, ChevronRight,
  Sparkles, Copy, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BlockNodeData } from "./BlockNode";
import type { TriggerNodeData } from "./TriggerNode";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Variable {
  name: string;
  source: string;
  type: string;
}

interface SchemaProperty {
  type: "string" | "number" | "boolean" | "array" | "object";
  description?: string;
  default?: unknown;
  enum?: unknown[];
}

interface BlockSchema {
  type: "object";
  properties?: Record<string, SchemaProperty>;
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

function ExpressionField({ value, onChange, variables, placeholder, multiline }: ExpressionFieldProps) {
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
          className={cn(
            "pr-10 font-mono text-sm",
            multiline && "min-h-[80px]"
          )}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-1 top-1 h-7 w-7 p-0"
          onClick={() => setShowVars(!showVars)}
          title="Insert variable"
        >
          <Sparkles className="size-4 text-primary" />
        </Button>
      </div>

      {/* Variable suggestions dropdown */}
      {showVars && variables.length > 0 && (
        <div className="border rounded-lg bg-popover shadow-lg overflow-hidden">
          <div className="p-2 border-b bg-muted/50 text-xs font-medium text-muted-foreground">
            Click to insert variable
          </div>
          <div className="max-h-[150px] overflow-y-auto">
            {variables.map((v) => (
              <div
                key={v.name}
                className="flex items-center justify-between px-3 py-2 hover:bg-accent cursor-pointer group"
              >
                <button
                  type="button"
                  className="flex-1 text-left flex items-center gap-2"
                  onClick={() => insertVariable(v.name)}
                >
                  <code className="text-xs text-primary font-mono">
                    {`{{ ${v.name} }}`}
                  </code>
                  <span className="text-xs text-muted-foreground">{v.type}</span>
                </button>
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-muted rounded"
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

function KeyValueEditor({ value, onChange, variables, keyPlaceholder = "key", valuePlaceholder = "value" }: KeyValueEditorProps) {
  const entries = Object.entries(value || {});
  
  const addEntry = () => {
    const newKey = `key${entries.length + 1}`;
    onChange({ ...value, [newKey]: "" });
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
        <div key={i} className="flex gap-2 items-start">
          <Input
            value={k}
            onChange={(e) => updateKey(k, e.target.value)}
            placeholder={keyPlaceholder}
            className="flex-1 text-xs font-mono"
          />
          <div className="flex-[2]">
            <ExpressionField
              value={String(v ?? "")}
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
      
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={addEntry}
      >
        <Plus className="size-4 mr-1" />
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
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();

  // Determine field type and render appropriate control
  const renderField = () => {
    // Boolean - Switch
    if (type === "boolean") {
      return (
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
          <div>
            <span className="text-sm font-medium">{label}</span>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
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
        <Select 
          value={String(value ?? defaultValue ?? "")} 
          onValueChange={(v) => onChange(v)}
        >
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
    if (type === "object") {
      const objValue = typeof value === "object" && value !== null 
        ? value as Record<string, unknown> 
        : {};
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
    if (type === "number") {
      return (
        <Input
          type="number"
          value={String(value ?? defaultValue ?? "")}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
          placeholder={description || `Enter ${label.toLowerCase()}`}
          className="bg-background"
        />
      );
    }

    // String - Expression input with variable support
    // Determine if multiline based on field name or description
    const isMultiline = 
      name === "message" || 
      name === "if" || 
      name === "value" ||
      description?.toLowerCase().includes("expression") ||
      description?.toLowerCase().includes("condition");

    return (
      <ExpressionField
        value={String(value ?? "")}
        onChange={(v) => onChange(v)}
        variables={variables}
        placeholder={description || `Enter ${label.toLowerCase()}`}
        multiline={isMultiline}
      />
    );
  };

  // Boolean fields render their own container
  if (type === "boolean") {
    return renderField();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label className="text-sm font-medium">{label}</Label>
        {required && <span className="text-red-500 text-xs">*</span>}
        {description && (
          <HelpCircle className="size-3.5 text-muted-foreground" title={description} />
        )}
      </div>
      {renderField()}
      {description && type !== "boolean" && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Trigger Config
// ─────────────────────────────────────────────────────────────────────────────

function TriggerConfig({ data, onUpdate }: { 
  data: TriggerNodeData; 
  onUpdate: (config: { event?: string; filter?: Record<string, unknown> }) => void;
}) {
  const [showFilter, setShowFilter] = useState(!!data.filter && Object.keys(data.filter).length > 0);
  
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Event Pattern</Label>
        <Input
          value={data.event}
          onChange={(e) => onUpdate({ event: e.target.value })}
          placeholder="sensor.*, timer.completed"
          className="font-mono bg-background"
        />
        <p className="text-xs text-muted-foreground">
          Use <code className="bg-muted px-1 rounded">*</code> as wildcard
        </p>
      </div>
      
      <div className="space-y-2">
        <button
          type="button"
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          onClick={() => setShowFilter(!showFilter)}
        >
          {showFilter ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          Filter (optional)
        </button>
        
        {showFilter && (
          <div className="pl-4 border-l-2 border-muted space-y-2">
            <p className="text-xs text-muted-foreground">
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
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">No configuration needed</p>
        <p className="text-xs mt-1">This block works with default settings</p>
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
          schema={fieldSchema}
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
  const isTrigger = node.type === "trigger";
  const data = node.data as (BlockNodeData | TriggerNodeData);
  const blockData = data as BlockNodeData;

  return (
    <div className={cn("flex flex-col h-full bg-card/50 backdrop-blur-sm border-l", className)}>
      {/* Header */}
      <div className="p-4 border-b bg-background/80">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">
              {isTrigger ? "Trigger Configuration" : blockData.label}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isTrigger ? "When this event occurs" : `Configure ${(blockData.type || "").split(":").pop()} block`}
            </p>
          </div>
          {!isTrigger && blockData.color && (
            <div 
              className="size-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: blockData.color + "20" }}
            >
              <div 
                className="size-3 rounded-full"
                style={{ backgroundColor: blockData.color }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {isTrigger ? (
            <TriggerConfig 
              data={data as TriggerNodeData} 
              onUpdate={onUpdateTrigger}
            />
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
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-3">
                <Sparkles className="size-4" />
                Available Variables
              </div>
              <div className="grid gap-1.5">
                {availableVariables.map((v) => (
                  <div 
                    key={v.name} 
                    className="flex items-center justify-between text-xs p-2 rounded-md bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                    onClick={() => navigator.clipboard.writeText(`{{ ${v.name} }}`)}
                    title="Click to copy"
                  >
                    <code className="text-primary font-mono">{`{{ ${v.name} }}`}</code>
                    <Badge variant="outline" className="text-[10px] h-5">
                      {v.type}
                    </Badge>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                Click to copy · Use in any text field
              </p>
            </div>
          </>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="p-3 border-t bg-background/80 text-xs text-muted-foreground text-center">
        Node ID: <code className="font-mono">{node.id}</code>
      </div>
    </div>
  );
}
