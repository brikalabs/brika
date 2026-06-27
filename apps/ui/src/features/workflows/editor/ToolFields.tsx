/**
 * Tool-related config fields: the tool-scoping multi-select
 * (format:'tool-multiselect'), the single tool picker (format:'tool-select'),
 * and the tool-argument picker (format:'tool-arg-select'). Extracted from
 * ConfigPanel to keep the schema-form core readable; they share its
 * ResolvedFieldInfo contract.
 */

import { Badge, Button, Input } from '@brika/clay';
import { Check, ChevronsUpDown, PencilLine, Wrench, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchTools, type ToolSummary } from '../api';
import { type DynamicOption, type ResolvedFieldInfo, toDisplayString } from './field-shared';

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
export function ToolMultiSelectField({ value, onChange }: Readonly<ResolvedFieldInfo>) {
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
export function ToolSelectField({ value, onChange, label }: Readonly<ResolvedFieldInfo>) {
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
export function ToolArgField({ value, onChange, label, allConfig }: Readonly<ResolvedFieldInfo>) {
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
