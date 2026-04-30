/**
 * Detail view for a single component: header + preview + token rows
 * grouped by category. Esc closes back to the list.
 */

import { Button } from '@brika/clay';
import type { TokenCategory } from '@brika/clay/tokens';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CATEGORY_ICONS, identityFor } from '../clay-component-identity';
import { CATEGORY_ORDER, COMPONENT_TOKEN_INDEX, tokensByCategoryFor } from '../clay-tokens';
import type { ThemeConfig } from '../types';
import { countOverrides } from './ComponentsList';
import { type PreviewMode, PreviewStage } from './PreviewStage';
import type { ColorSetter, ComponentTokenSetter } from './TokenRow';
import { TokenRow } from './TokenRow';

interface ComponentDetailProps {
  component: string;
  draft: ThemeConfig;
  onBack: () => void;
  onColorChange: ColorSetter;
  onTokenChange: ComponentTokenSetter;
  onResetAll: () => void;
}

export function ComponentDetail({
  component,
  draft,
  onBack,
  onColorChange,
  onTokenChange,
  onResetAll,
}: Readonly<ComponentDetailProps>) {
  const { t } = useTranslation('themeBuilder');
  const [mode, setMode] = useState<PreviewMode>('light');
  const totalOverrides = countOverrides(draft, component);
  const grouped = tokensByCategoryFor(component);
  const meta = identityFor(component);
  const Preview = meta.Preview;

  // Esc returns to the list. Only active while the detail view is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onBack();
      }
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <div className="space-y-4">
      <header className="space-y-3">
        <Button
          variant="ghost"
          size="xs"
          onClick={onBack}
          className="-mx-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wider hover:text-foreground"
          aria-label={t('components.backLabel')}
        >
          <ArrowLeft className="size-3" />
          {t('components.backShort', { defaultValue: t('components.backLabel') })}
        </Button>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-0.5">
            <h2 className="truncate font-semibold text-base">
              {t(`components.items.${component}.label`, { defaultValue: component })}
            </h2>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {t(`components.items.${component}.description`, {
                defaultValue: t('components.tokenCount', {
                  count: COMPONENT_TOKEN_INDEX[component]?.length ?? 0,
                  defaultValue: `${COMPONENT_TOKEN_INDEX[component]?.length ?? 0} tokens`,
                }),
              })}
            </p>
          </div>
          <Button
            size="xs"
            variant="outline"
            onClick={onResetAll}
            disabled={totalOverrides === 0}
            className="shrink-0"
          >
            <RotateCcw />
            {totalOverrides > 0
              ? t('components.resetCount', {
                  count: totalOverrides,
                  defaultValue: t('components.resetAll'),
                })
              : t('components.resetAll')}
          </Button>
        </div>
      </header>

      <PreviewStage draft={draft} mode={mode} onModeChange={setMode}>
        {Preview ? <Preview /> : <PreviewPlaceholder />}
      </PreviewStage>

      {CATEGORY_ORDER.map((category) => {
        const tokens = grouped[category];
        if (!tokens || tokens.length === 0) {
          return null;
        }
        return (
          <CategorySection key={category} category={category}>
            {tokens.map((spec) => (
              <TokenRow
                key={spec.name}
                spec={spec}
                draft={draft}
                mode={mode}
                onColorChange={onColorChange}
                onTokenChange={onTokenChange}
              />
            ))}
          </CategorySection>
        );
      })}
    </div>
  );
}

function PreviewPlaceholder() {
  const { t } = useTranslation('themeBuilder');
  return (
    <div className="text-center text-[10px] text-muted-foreground">
      {t('components.noPreview', { defaultValue: 'Preview unavailable for this component' })}
    </div>
  );
}

interface CategorySectionProps {
  category: TokenCategory;
  children: ReactNode;
}

function CategorySection({ category, children }: Readonly<CategorySectionProps>) {
  const { t } = useTranslation('themeBuilder');
  const Icon = CATEGORY_ICONS[category];
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Icon className="size-3 text-muted-foreground" />
        <span className="font-semibold text-[11px] uppercase tracking-wider">
          {t(`components.categories.${category}`, { defaultValue: category })}
        </span>
      </div>
      <div className="space-y-3 rounded-container border p-3">{children}</div>
    </section>
  );
}
