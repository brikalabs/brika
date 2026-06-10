/**
 * Echo block config view.
 *
 * Owns the whole config panel for the echo block: a prefix and suffix builder
 * plus a live "available variables" palette driven by useBlockVariables(). The
 * palette lists the typed variables resolved from upstream events (name + type)
 * and, on click, inserts a `{{ name }}` reference into the focused field while
 * also copying it to the clipboard. This showcases typed event autocompletion:
 * the list is derived from the real resolved upstream payload types, with zero
 * host hardcoding.
 */

import { useBlockConfig, useBlockVariables, useUpdateBlockConfig } from '@brika/sdk/block-views';
import { Badge, Input, Label } from '@brika/sdk/ui-kit';
import { useLocale } from '@brika/sdk/ui-kit/hooks';
import { Braces, Check, Copy, MessageCircle, Variable } from 'lucide-react';
import { useState } from 'react';

interface EchoConfig {
  prefix?: string;
  suffix?: string;
}

type FieldKey = 'prefix' | 'suffix';

export default function EchoView() {
  const { t } = useLocale();
  const config = useBlockConfig<EchoConfig>();
  const update = useUpdateBlockConfig();
  const variables = useBlockVariables();
  const [activeField, setActiveField] = useState<FieldKey>('suffix');
  const [copied, setCopied] = useState<string | null>(null);

  const insertVariable = (name: string) => {
    const ref = `{{ ${name} }}`;
    const current = config[activeField] ?? '';
    update({ [activeField]: `${current}${ref}` });
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(ref).catch(() => undefined);
    }
    setCopied(name);
    globalThis.setTimeout(() => {
      setCopied((current) => (current === name ? null : current));
    }, 1200);
  };

  const prefix = config.prefix ?? '';
  const suffix = config.suffix ?? '';
  const preview = `${prefix}{{ message }}${suffix}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-blue-500">
        <MessageCircle className="size-4" />
        <span className="font-medium text-foreground text-sm">Echo template</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Prefix</Label>
          <Input
            value={prefix}
            onFocus={() => setActiveField('prefix')}
            onChange={(e) => update({ prefix: e.target.value })}
            placeholder={t('blocks.echo.prefixPlaceholder')}
            className={`bg-background font-mono ${activeField === 'prefix' ? 'ring-1 ring-blue-500/40' : ''}`}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Suffix</Label>
          <Input
            value={suffix}
            onFocus={() => setActiveField('suffix')}
            onChange={(e) => update({ suffix: e.target.value })}
            placeholder={t('blocks.echo.suffixPlaceholder')}
            className={`bg-background font-mono ${activeField === 'suffix' ? 'ring-1 ring-blue-500/40' : ''}`}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Braces className="size-3.5" />
          <span className="text-xs">Preview</span>
        </div>
        <code className="block break-words rounded-md border bg-muted/40 px-2.5 py-1.5 font-mono text-foreground text-xs">
          {preview}
        </code>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Variable className="size-3.5" />
            <span className="text-xs">Available variables</span>
          </div>
          {variables.length > 0 && (
            <Badge variant="secondary" className="font-mono text-[10px]">
              {variables.length}
            </Badge>
          )}
        </div>

        {variables.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-muted-foreground text-xs">
            <Variable className="size-4 shrink-0" />
            <span>
              No upstream variables yet. Connect an event source and its typed payload appears here.
            </span>
          </div>
        ) : (
          <ul className="space-y-1">
            {variables.map((variable) => {
              const isCopied = copied === variable.name;
              return (
                <li key={variable.name}>
                  <button
                    type="button"
                    onClick={() => insertVariable(variable.name)}
                    title={`Insert {{ ${variable.name} }} into ${activeField} (copied to clipboard)`}
                    className="group flex w-full items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-left transition-colors hover:border-blue-500/50 hover:bg-blue-500/5"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium font-mono text-foreground text-xs">
                      {variable.name}
                    </span>
                    <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                      {variable.type}
                    </Badge>
                    {isCopied ? (
                      <Check className="size-3.5 shrink-0 text-green-500" />
                    ) : (
                      <Copy className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-muted-foreground text-xs">
          Click a variable to insert <span className="font-mono">{'{{ name }}'}</span> into the{' '}
          <span className="font-medium text-foreground">{activeField}</span> field.
        </p>
      </div>
    </div>
  );
}
