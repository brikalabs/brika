/**
 * Single-token row in the per-component detail view. Renders the token
 * name, description, override indicator, reset button, and dispatches
 * to `TokenField` for the actual value editor.
 */

import { cn } from '@brika/clay';
import type { ResolvedTokenSpec } from '@brika/clay/tokens';
import { RotateCcw } from 'lucide-react';
import { useCallback } from 'react';
import type { ThemeConfig } from '../types';
import type { PreviewMode } from './PreviewStage';
import { TokenField } from './TokenField';

export type ColorSlot = 'light' | 'dark' | 'both';
export type ColorSetter = (token: string, slot: ColorSlot, value: string | undefined) => void;
export type ComponentTokenSetter = (
  component: string,
  suffix: string,
  value: string | undefined
) => void;

interface TokenRowProps {
  spec: ResolvedTokenSpec;
  draft: ThemeConfig;
  mode: PreviewMode;
  onColorChange: ColorSetter;
  onTokenChange: ComponentTokenSetter;
}

export function TokenRow({
  spec,
  draft,
  mode,
  onColorChange,
  onTokenChange,
}: Readonly<TokenRowProps>) {
  const overridden = isOverridden(spec, draft);
  const reset = useCallback(() => {
    if (spec.type === 'color') {
      onColorChange(spec.name, 'both', undefined);
    } else if (spec.appliesTo) {
      const suffix = spec.name.replace(`${spec.appliesTo}-`, '');
      onTokenChange(spec.appliesTo, suffix, undefined);
    }
  }, [spec, onColorChange, onTokenChange]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <code className="truncate font-mono text-[10px] text-muted-foreground">{spec.name}</code>
          {overridden && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />}
        </div>
        <button
          type="button"
          onClick={reset}
          disabled={!overridden}
          aria-label="Reset"
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-control transition-[opacity,background-color,color]',
            overridden
              ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
              : 'pointer-events-none text-muted-foreground/40'
          )}
        >
          <RotateCcw className="size-3" />
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug">{spec.description}</p>
      <TokenField
        spec={spec}
        draft={draft}
        mode={mode}
        onColorChange={onColorChange}
        onTokenChange={onTokenChange}
      />
    </div>
  );
}

function isOverridden(spec: ResolvedTokenSpec, draft: ThemeConfig): boolean {
  if (spec.type === 'color') {
    return (
      draft.colors.light[spec.name] !== undefined || draft.colors.dark[spec.name] !== undefined
    );
  }
  if (!spec.appliesTo) {
    return false;
  }
  const suffix = spec.name.replace(`${spec.appliesTo}-`, '');
  return draft.componentTokens?.[spec.appliesTo]?.[suffix] !== undefined;
}
