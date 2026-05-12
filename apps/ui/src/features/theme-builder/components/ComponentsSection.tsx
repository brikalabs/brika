/**
 * ComponentsSection — orchestrator for the per-component token editor.
 *
 * Two views: a grouped list of every clay component (`ComponentsList`)
 * and a detail panel for the selected component (`ComponentDetail`).
 * This file owns the selection state and the three mutation callbacks
 * (component-token override, color override, full reset). Token reads
 * use the v2 nested shape (`draft.components`, `draft.colors.{light,dark}`).
 */

import { useCallback, useState } from 'react';
import { COMPONENT_TOKEN_INDEX } from '../clay-tokens';
import { kebabToCamel } from '../naming';
import type { ThemeConfig, TokenMap } from '../types';
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
      const camel = kebabToCamel(suffix);
      const nextTokens: Record<string, Record<string, string>> = { ...draft.components };
      const current: Record<string, string> = { ...nextTokens[component] };
      if (value === undefined) {
        delete current[camel];
      } else {
        current[camel] = value;
      }
      if (Object.keys(current).length === 0) {
        delete nextTokens[component];
      } else {
        nextTokens[component] = current;
      }
      onChange({
        ...draft,
        components: Object.keys(nextTokens).length === 0 ? undefined : nextTokens,
      });
    },
    [draft, onChange]
  );

  const setColor = useCallback<ColorSetter>(
    (token, slot, value) => {
      const light: TokenMap = { ...draft.colors?.light };
      const dark: TokenMap = { ...draft.colors?.dark };
      if (slot === 'light' || slot === 'both') {
        if (value === undefined) {
          delete light[token];
        } else {
          light[token] = value;
        }
      }
      if (slot === 'dark' || slot === 'both') {
        if (value === undefined) {
          delete dark[token];
        } else {
          dark[token] = value;
        }
      }
      onChange({ ...draft, colors: { light, dark } });
    },
    [draft, onChange]
  );

  const resetComponent = useCallback(
    (component: string) => {
      const tokens = COMPONENT_TOKEN_INDEX[component] ?? [];
      const nextTokens = { ...draft.components };
      delete nextTokens[component];
      const light: TokenMap = { ...draft.colors?.light };
      const dark: TokenMap = { ...draft.colors?.dark };
      for (const spec of tokens) {
        if (spec.type === 'color') {
          delete light[spec.name];
          delete dark[spec.name];
        }
      }
      onChange({
        ...draft,
        components: Object.keys(nextTokens).length === 0 ? undefined : nextTokens,
        colors: { light, dark },
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
