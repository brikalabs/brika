import type { Json, PreferenceDefinition } from '@brika/shared';
import { RefreshCw, Trash2, X } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Avatar,
  AvatarFallback,
  Button,
  ButtonGroup,
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
import { brickTypesApi, dashboardsApi } from '../api';
import { useRemoveBrick, useRenameBrick } from '../hooks';
import { useDashboardStore } from '../store';

// ─── Field Renderers ──────────────────────────────────────────────────────────

/** Extract the default value from any preference variant (not all have one). */
function getDefault(field: PreferenceDefinition): unknown {
  if ('default' in field) return field.default;
  return undefined;
}

interface FieldProps {
  field: PreferenceDefinition;
  value: Json;
  onChange: (name: string, value: Json) => void;
  pluginName: string;
  brickLocalId: string;
  brickTypeId: string;
}

function TextField({ field, value, onChange }: Readonly<FieldProps>) {
  return (
    <Input
      id={field.name}
      type={field.type === 'password' ? 'password' : 'text'}
      value={String(value ?? getDefault(field) ?? '')}
      onChange={(e) => onChange(field.name, e.target.value)}
    />
  );
}

function NumberField({ field, value, onChange }: Readonly<FieldProps>) {
  if (field.type !== 'number') return null;
  return (
    <Input
      id={field.name}
      type="number"
      min={field.min}
      max={field.max}
      step={field.step}
      value={String(value ?? getDefault(field) ?? '')}
      onChange={(e) => onChange(field.name, Number(e.target.value))}
    />
  );
}

function CheckboxField({ field, value, onChange }: Readonly<FieldProps>) {
  const checked = Boolean(value ?? getDefault(field) ?? false);
  return (
    <Switch id={field.name} checked={checked} onCheckedChange={(v) => onChange(field.name, v)} />
  );
}

function DropdownField({
  field,
  value,
  onChange,
  pluginName,
  brickLocalId,
  brickTypeId,
}: Readonly<FieldProps>) {
  const { tp } = useLocale();
  const isDynamic = field.type === 'dynamic-dropdown';
  if (field.type !== 'dropdown' && !isDynamic) return null;

  const [dynamicOptions, setDynamicOptions] = useState<Array<{ value: string; label?: string }>>(
    isDynamic ? (field.options ?? []) : []
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await brickTypesApi.getConfigOptions(brickTypeId, field.name);
      setDynamicOptions(data.options);
    } finally {
      setIsRefreshing(false);
    }
  }, [brickTypeId, field.name]);

  const options = isDynamic ? dynamicOptions : field.options;
  const optionLabel = (opt: { value: string; label?: string }) =>
    opt.label ??
    tp(pluginName, `bricks.${brickLocalId}.config.${field.name}.options.${opt.value}`, opt.value);

  return (
    <div className="flex items-center gap-2">
      <Select
        value={String(value ?? getDefault(field) ?? '')}
        onValueChange={(v) => onChange(field.name, v)}
      >
        <SelectTrigger id={field.name} className="min-w-0 flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {optionLabel(opt)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isDynamic && (
        <Button variant="ghost" size="icon" onClick={refresh} disabled={isRefreshing}>
          <RefreshCw className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      )}
    </div>
  );
}

function ConfigField(props: Readonly<FieldProps>) {
  switch (props.field.type) {
    case 'dropdown':
    case 'dynamic-dropdown':
      return <DropdownField {...props} />;
    case 'number':
      return <NumberField {...props} />;
    case 'checkbox':
      return <CheckboxField {...props} />;
    case 'text':
    case 'password':
      return <TextField {...props} />;
  }
}

// ─── ConfigSheet ──────────────────────────────────────────────────────────────

export function ConfigSheet() {
  const { t, tp } = useLocale();
  const configBrickId = useDashboardStore((s) => s.configBrickId);
  const setConfigBrickId = useDashboardStore((s) => s.setConfigBrickId);
  const activeDashboard = useDashboardStore((s) => s.activeDashboard);
  const brickTypes = useDashboardStore((s) => s.brickTypes);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { mutate: removeBrick } = useRemoveBrick();
  const { mutate: renameBrick } = useRenameBrick();

  const placement = useMemo(
    () => activeDashboard?.bricks.find((c) => c.instanceId === configBrickId),
    [activeDashboard, configBrickId]
  );
  const brickType = placement ? brickTypes.get(placement.brickTypeId) : null;

  const [localConfig, setLocalConfig] = useState<Record<string, Json>>({});
  const [localLabel, setLocalLabel] = useState('');

  // Sync state when opening
  const open = !!configBrickId;
  useEffect(() => {
    if (placement) {
      setLocalConfig({ ...placement.config });
      setLocalLabel(placement.label ?? '');
    }
  }, [placement]);

  const handleClose = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        setConfigBrickId(null);
        setLocalConfig({});
        setLocalLabel('');
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

    // Save label if changed
    const trimmedLabel = localLabel.trim();
    const oldLabel = placement?.label ?? '';
    if (trimmedLabel !== oldLabel) {
      renameBrick({ instanceId: configBrickId, label: trimmedLabel || undefined });
    }

    // Save config if there are config fields
    const configSchema = brickType?.config;
    if (configSchema && configSchema.length > 0) {
      await dashboardsApi.updateBrick(activeDashboard.id, configBrickId, { config: localConfig });
      useDashboardStore.getState().updateBrickConfig(configBrickId, localConfig);
    }

    setSaving(false);
    setConfigBrickId(null);
    setLocalConfig({});
    setLocalLabel('');
  }, [
    activeDashboard,
    configBrickId,
    localConfig,
    localLabel,
    placement,
    brickType,
    renameBrick,
    setConfigBrickId,
  ]);

  const handleDelete = useCallback(() => {
    if (!configBrickId) return;
    removeBrick(configBrickId);
    setDeleteOpen(false);
    setConfigBrickId(null);
  }, [configBrickId, removeBrick, setConfigBrickId]);

  const configSchema = brickType?.config;
  const hasConfig = Array.isArray(configSchema) && configSchema.length > 0;
  const color = brickType?.color ?? 'var(--color-primary)';
  const iconName = (brickType?.icon ?? 'layout-dashboard') as IconName;
  const brickTypeName = brickType
    ? tp(
        brickType.pluginName,
        `bricks.${brickType.localId}.name`,
        brickType.name ?? brickType.localId
      )
    : configBrickId;
  const displayName = placement?.label || brickTypeName;

  return (
    <>
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
              {displayName}
            </SheetTitle>
            <SheetDescription>{t('bricks:config.description')}</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-auto px-4">
            {/* ── Rename ─────────────────────────────────────── */}
            <div className="space-y-1.5">
              <Label htmlFor="brick-label">{t('common:labels.name')}</Label>
              <ButtonGroup className="w-full">
                <Input
                  id="brick-label"
                  value={localLabel}
                  onChange={(e) => setLocalLabel(e.target.value)}
                  placeholder={brickTypeName ?? ''}
                />
                <Button variant="outline" onClick={() => setLocalLabel('')} disabled={!localLabel}>
                  <X />
                </Button>
              </ButtonGroup>
            </div>

            {/* ── Config fields ──────────────────────────────── */}
            {hasConfig && brickType && (
              <div className="mt-4 space-y-3 rounded-lg border p-3">
                {configSchema.map((field) => {
                  const fieldLabel = tp(
                    brickType.pluginName,
                    `bricks.${brickType.localId}.config.${field.name}.label`,
                    field.label ?? field.name
                  );
                  const fieldDesc = tp(
                    brickType.pluginName,
                    `bricks.${brickType.localId}.config.${field.name}.description`,
                    field.description ?? ''
                  );
                  return (
                    <div
                      key={field.name}
                      className={
                        field.type === 'checkbox'
                          ? 'flex items-center justify-between gap-2'
                          : 'space-y-1.5'
                      }
                    >
                      <div>
                        <Label htmlFor={field.name} className="text-sm">
                          {fieldLabel}
                        </Label>
                        {fieldDesc && <p className="text-muted-foreground text-xs">{fieldDesc}</p>}
                      </div>
                      <ConfigField
                        field={field}
                        value={localConfig[field.name]}
                        onChange={handleFieldChange}
                        pluginName={brickType.pluginName}
                        brickLocalId={brickType.localId}
                        brickTypeId={brickType.id}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Instance info ──────────────────────────────── */}
            <div className="mt-4 rounded-lg border p-3">
              <span className="font-medium text-muted-foreground text-xs">
                {t('common:labels.details')}
              </span>
              <dl className="mt-2 space-y-1 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t('bricks:config.instance')}</dt>
                  <dd className="truncate font-mono">{configBrickId}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t('common:labels.type')}</dt>
                  <dd className="truncate font-mono">{placement?.brickTypeId}</dd>
                </div>
                {brickType?.pluginName && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{t('bricks:config.plugin')}</dt>
                    <dd className="truncate font-mono">{brickType.pluginName}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          <SheetFooter className="flex-row justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="mr-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="mr-1.5 size-3.5" />
              {t('common:actions.delete')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleClose(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? t('common:messages.saving') : t('common:actions.save')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common:messages.confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>{displayName}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common:actions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
