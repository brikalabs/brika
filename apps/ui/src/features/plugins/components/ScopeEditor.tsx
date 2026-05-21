/**
 * ScopeEditor — renders an editor for one capability's grant scope, driven
 * by the `ui` hint on the capability spec.
 *
 * Two shapes today:
 *   - `string-array` — input + chip list (net hosts, fs paths, exec binaries).
 *   - `none`         — read-only JSON preview (capabilities whose scope has
 *                      no user-editable fields, like `prefs`).
 *
 * The editor works in *controlled* mode: the parent owns the scope state and
 * the editor calls `onChange(next)` with the full updated scope every time.
 */

import { Badge, Button, Input } from '@brika/clay';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useLocale } from '@/lib/use-locale';
import type { ScopeEditorHint } from '../api';

interface ScopeEditorProps {
  hint: ScopeEditorHint;
  scope: unknown;
  onChange: (next: unknown) => void;
  disabled?: boolean;
}

function readStringArray(scope: unknown, field: string): string[] {
  if (!scope || typeof scope !== 'object') {
    return [];
  }
  const value = (scope as Record<string, unknown>)[field];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((v): v is string => typeof v === 'string');
}

export function ScopeEditor({ hint, scope, onChange, disabled }: Readonly<ScopeEditorProps>) {
  if (hint.kind === 'string-array') {
    return (
      <StringArrayEditor
        scope={scope}
        field={hint.field}
        labelKey={hint.labelKey}
        placeholderKey={hint.placeholderKey}
        exampleKey={hint.exampleKey}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }
  // 'none' — read-only JSON preview.
  return (
    <pre className="rounded-md bg-muted/40 p-2 font-mono text-muted-foreground text-xs">
      {JSON.stringify(scope ?? {}, null, 2)}
    </pre>
  );
}

interface StringArrayEditorProps {
  scope: unknown;
  field: string;
  labelKey?: string;
  placeholderKey?: string;
  exampleKey?: string;
  onChange: (next: unknown) => void;
  disabled?: boolean;
}

function StringArrayEditor({
  scope,
  field,
  labelKey,
  placeholderKey,
  exampleKey,
  onChange,
  disabled,
}: Readonly<StringArrayEditorProps>) {
  const { t } = useLocale();
  const [draft, setDraft] = useState('');
  const entries = readStringArray(scope, field);

  const base: Record<string, unknown> =
    scope && typeof scope === 'object' ? { ...(scope as Record<string, unknown>) } : {};

  const add = () => {
    const v = draft.trim();
    if (v === '' || entries.includes(v)) {
      return;
    }
    onChange({ ...base, [field]: [...entries, v] });
    setDraft('');
  };

  const remove = (value: string) => {
    onChange({ ...base, [field]: entries.filter((e) => e !== value) });
  };

  return (
    <div className="flex flex-col gap-2">
      {labelKey && <span className="font-medium text-muted-foreground text-xs">{t(labelKey)}</span>}
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholderKey ? t(placeholderKey) : undefined}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          className="flex-1 font-mono text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          disabled={disabled || draft.trim() === ''}
          className="gap-1"
        >
          <Plus className="size-3" />
          {t('common:actions.add')}
        </Button>
      </div>
      {entries.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entries.map((value) => (
            <Badge key={value} variant="secondary" className="gap-1 font-mono">
              {value}
              <button
                type="button"
                onClick={() => remove(value)}
                disabled={disabled}
                className="rounded-full p-0.5 hover:bg-muted-foreground/10"
                aria-label={t('common:actions.remove')}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      {exampleKey && <span className="text-muted-foreground text-xs">{t(exampleKey)}</span>}
    </div>
  );
}
