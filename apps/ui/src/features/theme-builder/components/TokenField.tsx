import type { ResolvedTokenSpec, TokenType } from '@brika/clay/tokens';
import { useCallback } from 'react';
import { tokenSuffix } from '../clay-tokens';
import type { ThemeConfig } from '../types';
import { ColorField } from './ColorField';
import {
  CornerShapeWidget,
  type NumericConfig,
  NumericWidget,
  SelectWidget,
  TextWidget,
} from './token-widgets';

const NUMERIC_BY_TYPE: Partial<Record<TokenType, NumericConfig>> = {
  radius: { unit: 'rem', min: 0, max: 2, step: 0.0625, decimals: 4 },
  size: { unit: 'rem', min: 0, max: 4, step: 0.0625, decimals: 4 },
  'border-width': { unit: 'px', min: 0, max: 8, step: 1, decimals: 0 },
  'font-size': { unit: 'rem', min: 0.5, max: 3, step: 0.0625, decimals: 4 },
  'line-height': { unit: '', min: 0.8, max: 2.5, step: 0.05, decimals: 2 },
  'letter-spacing': { unit: 'em', min: -0.1, max: 0.3, step: 0.005, decimals: 3 },
  blur: { unit: 'px', min: 0, max: 64, step: 1, decimals: 0 },
  duration: { unit: 'ms', min: 0, max: 1000, step: 10, decimals: 0 },
  opacity: { unit: '', min: 0, max: 1, step: 0.01, decimals: 2 },
};

const SELECT_OPTIONS: Partial<Record<TokenType, readonly string[]>> = {
  'border-style': ['solid', 'dashed', 'double', 'none'],
  'text-transform': ['none', 'uppercase', 'lowercase', 'capitalize'],
  'font-weight': ['300', '400', '500', '600', '700', '800', '900'],
};

interface TokenFieldProps {
  spec: ResolvedTokenSpec;
  draft: ThemeConfig;
  mode: 'light' | 'dark';
  onColorChange: (
    token: string,
    slot: 'light' | 'dark' | 'both',
    value: string | undefined
  ) => void;
  onTokenChange: (component: string, suffix: string, value: string | undefined) => void;
}

export function TokenField({
  spec,
  draft,
  mode,
  onColorChange,
  onTokenChange,
}: Readonly<TokenFieldProps>) {
  if (spec.type === 'color') {
    const palette = mode === 'light' ? draft.colors.light : draft.colors.dark;
    const fallback = mode === 'dark' && spec.defaultDark ? spec.defaultDark : spec.defaultLight;
    return (
      <ColorField
        label={spec.name}
        value={palette[spec.name] ?? fallback}
        onChange={(v) => onColorChange(spec.name, 'both', v)}
      />
    );
  }
  if (spec.appliesTo) {
    return (
      <NonColorWidget
        spec={spec}
        component={spec.appliesTo}
        draft={draft}
        onTokenChange={onTokenChange}
      />
    );
  }
  return null;
}

interface NonColorWidgetProps {
  spec: ResolvedTokenSpec;
  component: string;
  draft: ThemeConfig;
  onTokenChange: (component: string, suffix: string, value: string | undefined) => void;
}

function NonColorWidget({ spec, component, draft, onTokenChange }: Readonly<NonColorWidgetProps>) {
  const suffix = tokenSuffix(spec);
  const setValue = useCallback(
    (value: string | undefined) => onTokenChange(component, suffix, value),
    [component, suffix, onTokenChange]
  );

  const stored = draft.componentTokens?.[component]?.[suffix];
  const effective = (stored !== undefined ? String(stored) : undefined) ?? spec.defaultLight;

  if (spec.type === 'corner-shape') {
    return <CornerShapeWidget value={effective} onChange={setValue} />;
  }
  const selectOpts = SELECT_OPTIONS[spec.type];
  if (selectOpts) {
    return <SelectWidget value={effective} options={selectOpts} onChange={setValue} />;
  }
  const numeric = NUMERIC_BY_TYPE[spec.type];
  if (numeric) {
    return <NumericWidget cfg={numeric} value={effective} onChange={setValue} />;
  }
  return <TextWidget value={effective} placeholder={spec.defaultLight} onChange={setValue} />;
}
