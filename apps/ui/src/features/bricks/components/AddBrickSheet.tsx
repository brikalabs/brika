import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { useMemo } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useLocale } from '@/lib/use-locale';
import type { BrickType } from '../api';
import { useAddBrick } from '../hooks';
import { useDashboardStore } from '../store';

export function AddBrickSheet() {
  const { t, tp } = useLocale();
  const open = useDashboardStore((s) => s.addBrickOpen);
  const setOpen = useDashboardStore((s) => s.setAddBrickOpen);
  const brickTypes = useDashboardStore((s) => s.brickTypes);
  const { mutate: addBrick, isPending } = useAddBrick();

  const typesByPlugin = useMemo(() => {
    const grouped = new Map<string, BrickType[]>();
    for (const t of brickTypes.values()) {
      let group = grouped.get(t.pluginName);
      if (!group) {
        group = [];
        grouped.set(t.pluginName, group);
      }
      group.push(t);
    }
    return grouped;
  }, [brickTypes]);

  const handleSelect = (brickType: BrickType) => {
    addBrick({ brickTypeId: brickType.id }, { onSuccess: () => setOpen(false) });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>{t('bricks:addSheet.title')}</SheetTitle>
          <SheetDescription>{t('bricks:addSheet.description')}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-auto px-4">
          {brickTypes.size === 0 && (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {t('bricks:addSheet.empty')}
            </div>
          )}
          {[...typesByPlugin.entries()].map(([pluginName, types]) => (
            <div key={pluginName} className="mb-4 space-y-1">
              <div className="px-2 pb-1 font-mono text-muted-foreground text-xs">{pluginName}</div>
              {types.map((t) => {
                const color = t.color ?? 'var(--color-primary)';

                return (
                  <div key={t.id} className="rounded-lg transition-colors hover:bg-muted/50">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleSelect(t)}
                      className="flex w-full items-center gap-3 p-2 text-left disabled:opacity-50"
                    >
                      <Avatar
                        className="size-8 rounded-lg"
                        style={{ backgroundColor: `${color}20` }}
                      >
                        <AvatarFallback
                          className="rounded-lg"
                          style={{ backgroundColor: `${color}20`, color }}
                        >
                          <DynamicIcon
                            name={(t.icon ?? 'layout-dashboard') as IconName}
                            className="size-4"
                          />
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-sm">
                          {tp(t.pluginName, `bricks.${t.localId}.name`, t.name ?? t.localId)}
                        </div>
                        {tp(
                          t.pluginName,
                          `bricks.${t.localId}.description`,
                          t.description ?? ''
                        ) && (
                          <div className="truncate text-muted-foreground text-xs">
                            {tp(
                              t.pluginName,
                              `bricks.${t.localId}.description`,
                              t.description ?? ''
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
