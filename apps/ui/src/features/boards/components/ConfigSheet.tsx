/**
 * ConfigSheet — side sheet for editing a brick's label and configured
 * preferences. Field rendering lives in `./config-sheet/field-renderers`,
 * state machine in `./config-sheet/use-config-sheet-state`.
 */

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
} from '@brika/clay';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@brika/clay/components/sheet';
import { Trash2, X } from 'lucide-react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { useLocale } from '@/lib/use-locale';
import { ConfigField } from './config-sheet/field-renderers';
import { useConfigSheetState } from './config-sheet/use-config-sheet-state';

export function ConfigSheet() {
  const { t, tp } = useLocale();
  const {
    open,
    configBrickId,
    placement,
    brickType,
    localConfig,
    localLabel,
    setLocalLabel,
    saving,
    deleteOpen,
    setDeleteOpen,
    handleClose,
    handleFieldChange,
    handleSave,
    handleDelete,
  } = useConfigSheetState();

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
            <SheetDescription>{t('boards:config.description')}</SheetDescription>
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
                  <dt className="text-muted-foreground">{t('boards:config.instance')}</dt>
                  <dd className="truncate font-mono">{configBrickId}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t('common:labels.type')}</dt>
                  <dd className="truncate font-mono">{placement?.brickTypeId}</dd>
                </div>
                {brickType?.pluginName && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{t('boards:config.plugin')}</dt>
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
