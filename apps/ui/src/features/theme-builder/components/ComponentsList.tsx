/**
 * Components-list view: groups every clay component into role buckets
 * (Controls / Surfaces / Overlays / Layout / Other) and shows a row per
 * component with override count.
 */

import { cn } from '@brika/clay';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type ComponentIdentity, GROUPS } from '../clay-component-identity';
import { COMPONENT_TOKEN_INDEX } from '../clay-tokens';
import type { ThemeConfig } from '../types';

/** Number of explicitly-overridden tokens for a component on the draft. */
export function countOverrides(draft: ThemeConfig, component: string): number {
  const tokens = COMPONENT_TOKEN_INDEX[component] ?? [];
  let count = 0;
  for (const spec of tokens) {
    if (spec.type === 'color') {
      if (
        draft.colors.light[spec.name] !== undefined ||
        draft.colors.dark[spec.name] !== undefined
      ) {
        count += 1;
      }
    } else {
      const suffix = spec.name.replace(`${component}-`, '');
      if (draft.componentTokens?.[component]?.[suffix] !== undefined) {
        count += 1;
      }
    }
  }
  return count;
}

interface ComponentsListProps {
  draft: ThemeConfig;
  onSelect: (component: string) => void;
}

export function ComponentsList({ draft, onSelect }: Readonly<ComponentsListProps>) {
  const { t } = useTranslation('themeBuilder');
  const totalOverrides = GROUPS.reduce(
    (sum, group) =>
      sum + group.items.reduce((acc, item) => acc + countOverrides(draft, item.key), 0),
    0
  );

  return (
    <div className="space-y-4">
      <p className="px-1 text-[10px] text-muted-foreground">
        {totalOverrides > 0
          ? t('components.customized', { count: totalOverrides })
          : t('components.listHint')}
      </p>
      {GROUPS.map((group) => (
        <section key={group.id} className="space-y-2">
          <h3 className="px-1 font-semibold text-[11px] text-foreground tracking-wide">
            {t(`components.groups.${group.id}`, { defaultValue: group.id })}
          </h3>
          <div className="divide-y overflow-hidden rounded-container border">
            {group.items.map((meta) => (
              <ComponentRow
                key={meta.key}
                meta={meta}
                draft={draft}
                onSelect={() => onSelect(meta.key)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

interface ComponentRowProps {
  meta: ComponentIdentity;
  draft: ThemeConfig;
  onSelect: () => void;
}

function ComponentRow({ meta, draft, onSelect }: Readonly<ComponentRowProps>) {
  const { t } = useTranslation('themeBuilder');
  const overrides = countOverrides(draft, meta.key);
  const customized = overrides > 0;
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex w-full items-center gap-3 px-2.5 py-2 text-left transition-colors hover:bg-muted/60"
    >
      <span
        aria-hidden
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-control border transition-colors',
          customized
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border bg-muted/40 text-muted-foreground group-hover:text-foreground'
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-xs">
          {t(`components.items.${meta.key}.label`, { defaultValue: meta.key })}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {t(`components.items.${meta.key}.description`, {
            defaultValue: t('components.tokenCount', {
              count: COMPONENT_TOKEN_INDEX[meta.key]?.length ?? 0,
              defaultValue: `${COMPONENT_TOKEN_INDEX[meta.key]?.length ?? 0} tokens`,
            }),
          })}
        </div>
      </div>
      {customized && (
        <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-medium font-mono text-[9px] text-primary tabular-nums">
          {overrides}
        </span>
      )}
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
    </button>
  );
}
