import type { Json, PreferenceDefinition } from '@brika/shared';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  AvatarFallback,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@/components/ui';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useLocale } from '@/lib/use-locale';
import { dashboardsApi } from '../api';
import { useDashboardStore } from '../store';

// ─── Field Renderers ──────────────────────────────────────────────────────────

interface FieldProps {
  field: PreferenceDefinition;
  value: Json;
  onChange: (name: string, value: Json) => void;
}

function TextField({ field, value, onChange }: FieldProps) {
  return (
    <Input
      id={field.name}
      type={field.type === 'password' ? 'password' : 'text'}
      value={String(value ?? field.default ?? '')}
      onChange={(e) => onChange(field.name, e.target.value)}
    />
  );
}

function NumberField({ field, value, onChange }: FieldProps) {
  const { min, max, step } = field as Extract<PreferenceDefinition, { type: 'number' }>;
  return (
    <Input
      id={field.name}
      type="number"
      min={min}
      max={max}
      step={step}
      value={String(value ?? field.default ?? '')}
      onChange={(e) => onChange(field.name, Number(e.target.value))}
    />
  );
}

function CheckboxField({ field, value, onChange }: FieldProps) {
  const checked = (value ?? field.default ?? false) as boolean;
  return (
    <Switch id={field.name} checked={checked} onCheckedChange={(v) => onChange(field.name, v)} />
  );
}

function DropdownField({ field, value, onChange }: FieldProps) {
  const { options } = field as Extract<PreferenceDefinition, { type: 'dropdown' }>;
  return (
    <Select
      value={String(value ?? field.default ?? '')}
      onValueChange={(v) => onChange(field.name, v)}
    >
      <SelectTrigger id={field.name}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.value}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ConfigField({ field, value, onChange }: FieldProps) {
  switch (field.type) {
    case 'dropdown':
      return <DropdownField field={field} value={value} onChange={onChange} />;
    case 'number':
      return <NumberField field={field} value={value} onChange={onChange} />;
    case 'checkbox':
      return <CheckboxField field={field} value={value} onChange={onChange} />;
    case 'text':
    case 'password':
      return <TextField field={field} value={value} onChange={onChange} />;
  }
}

// ─── ConfigSheet ──────────────────────────────────────────────────────────────

export function ConfigSheet() {
  const { t } = useLocale();
  const configBrickId = useDashboardStore((s) => s.configBrickId);
  const setConfigBrickId = useDashboardStore((s) => s.setConfigBrickId);
  const activeDashboard = useDashboardStore((s) => s.activeDashboard);
  const brickTypes = useDashboardStore((s) => s.brickTypes);
  const [saving, setSaving] = useState(false);

  const placement = useMemo(
    () => activeDashboard?.bricks.find((c) => c.instanceId === configBrickId),
    [activeDashboard, configBrickId]
  );
  const brickType = placement ? brickTypes.get(placement.brickTypeId) : null;

  const [localConfig, setLocalConfig] = useState<Record<string, Json>>({});

  // Sync config when opening
  const open = !!configBrickId;
  useEffect(() => {
    if (placement) {
      setLocalConfig({ ...placement.config });
    }
  }, [placement]);

  const handleClose = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        setConfigBrickId(null);
        setLocalConfig({});
      }
    },
    [setConfigBrickId]
  );

  const handleFieldChange = useCallback((name: string, value: Json) => {
    setLocalConfig((c) => ({ ...c, [name]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!activeDashboard || !configBrickId) return;
    setSaving(true);
    await dashboardsApi.updateBrick(activeDashboard.id, configBrickId, { config: localConfig });
    // Optimistic: update placement config in store (SSE will sync other browsers)
    useDashboardStore.getState().updateBrickConfig(configBrickId, localConfig);
    setSaving(false);
    setConfigBrickId(null);
    setLocalConfig({});
  }, [activeDashboard, configBrickId, localConfig, setConfigBrickId]);

  const configSchema = brickType?.config;
  const color = brickType?.color ?? 'var(--color-primary)';
  const iconName = (brickType?.icon ?? 'layout-dashboard') as IconName;

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full sm:max-w-sm">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Avatar className="size-6 rounded-md" style={{ backgroundColor: `${color}20` }}>
              <AvatarFallback
                className="rounded-md text-[10px]"
                style={{ backgroundColor: `${color}20`, color }}
              >
                <DynamicIcon name={iconName} className="size-3" />
              </AvatarFallback>
            </Avatar>
            {brickType?.name ?? t('bricks:config.title')}
          </SheetTitle>
          <SheetDescription>{t('bricks:config.description')}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-auto px-4">
          {configSchema && configSchema.length > 0 ? (
            configSchema.map((field) => (
              <div
                key={field.name}
                className={
                  field.type === 'checkbox'
                    ? 'flex items-center justify-between gap-2'
                    : 'space-y-1.5'
                }
              >
                <div>
                  <Label htmlFor={field.name}>{field.label ?? field.name}</Label>
                  {field.description && (
                    <p className="text-muted-foreground text-xs">{field.description}</p>
                  )}
                </div>
                <ConfigField
                  field={field}
                  value={localConfig[field.name]}
                  onChange={handleFieldChange}
                />
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {t('bricks:config.noOptions')}
            </div>
          )}
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || !configSchema?.length}>
            {saving ? t('common:messages.saving') : t('common:actions.save')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
