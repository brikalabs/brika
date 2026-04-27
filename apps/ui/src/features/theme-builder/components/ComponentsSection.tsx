/**
 * ComponentsSection — orchestrator for the per-component token editor.
 *
 * Two views: a grouped list of every clay component (`ComponentsList`)
 * and a detail panel for the selected component (`ComponentDetail`).
 * This file owns the selection state and the three mutation callbacks
 * (component-token override, color override, full reset). The actual
 * rendering and override-counting live in the extracted modules.
 */

import { useCallback, useState } from 'react';
import { COMPONENT_TOKEN_INDEX } from '../clay-tokens';
import type { ComponentTokens, ThemeColors, ThemeConfig } from '../types';
import { ComponentDetail } from './ComponentDetail';
import { ComponentsList } from './ComponentsList';
import type { ColorSetter, ComponentTokenSetter } from './TokenRow';

interface ComponentsSectionProps {
  draft: ThemeConfig;
  onChange: (next: ThemeConfig) => void;
}

export function ComponentsSection({ draft, onChange }: Readonly<ComponentsSectionProps>) {
  const [selected, setSelected] = useState<string | null>(null);

  const setComponentToken = useCallback<ComponentTokenSetter>(
    (component, suffix, value) => {
      const nextTokens: Record<string, ComponentTokens> = { ...draft.componentTokens };
      const current: ComponentTokens = { ...nextTokens[component] };
      if (value === undefined) {
        delete current[suffix];
      } else {
        current[suffix] = value;
      }
      if (Object.keys(current).length === 0) {
        delete nextTokens[component];
      } else {
        nextTokens[component] = current;
      }
      onChange({
        ...draft,
        componentTokens: Object.keys(nextTokens).length === 0 ? undefined : nextTokens,
      });
    },
    [draft, onChange]
  );

  const setColor = useCallback<ColorSetter>(
    (token, slot, value) => {
      const light = { ...draft.colors.light };
      const dark = { ...draft.colors.dark };
      if (slot === 'light' || slot === 'both') {
        if (value === undefined) {
          delete light[token];
        } else {
          (light as Record<string, string>)[token] = value;
        }
      }
      if (slot === 'dark' || slot === 'both') {
        if (value === undefined) {
          delete dark[token];
        } else {
          (dark as Record<string, string>)[token] = value;
        }
      }
      onChange({ ...draft, colors: { light: light as ThemeColors, dark: dark as ThemeColors } });
    },
    [draft, onChange]
  );

  const resetComponent = useCallback(
    (component: string) => {
      const tokens = COMPONENT_TOKEN_INDEX[component] ?? [];
      const nextTokens = { ...draft.componentTokens };
      delete nextTokens[component];
      const light = { ...draft.colors.light };
      const dark = { ...draft.colors.dark };
      for (const spec of tokens) {
        if (spec.type === 'color') {
          delete light[spec.name];
          delete dark[spec.name];
        }
      }
      onChange({
        ...draft,
        componentTokens: Object.keys(nextTokens).length === 0 ? undefined : nextTokens,
        colors: { light: light as ThemeColors, dark: dark as ThemeColors },
      });
    },
    [draft, onChange]
  );

  if (selected) {
    return (
      <ComponentDetail
        component={selected}
        draft={draft}
        onBack={() => setSelected(null)}
        onColorChange={setColor}
        onTokenChange={setComponentToken}
        onResetAll={() => resetComponent(selected)}
      />
    );
  }

  return <ComponentsList draft={draft} onSelect={setSelected} />;
}
