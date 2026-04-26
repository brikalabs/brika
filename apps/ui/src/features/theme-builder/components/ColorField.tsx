/**
 * ColorField — token row with swatch, name, contrast badge, and hex input.
 *
 * Layout:  [ swatch ][ token name ] [contrast] [ hex input ]
 *
 * The swatch chip opens the native color picker. The hex input accepts
 * any CSS color string (hex / oklch / rgb / hsl). When `pairWith` is
 * set, a WCAG contrast ratio badge is rendered so foreground/surface
 * pairings stay honest.
 */

import { cn } from '@brika/clay';
import { Tooltip, TooltipContent, TooltipTrigger } from '@brika/clay/components/tooltip';
import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { contrastRatio, gradeContrast } from '../color-utils';

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  pairWith?: string;
  pairLabel?: string;
  /** Optional human description shown in a tooltip on the label. */
  description?: string;
  /** Optional code snippet ("bg-primary text-primary-foreground") shown below the description. */
  example?: string;
  /** Optional CSS custom-property name ("--primary") shown after the label. */
  cssVar?: string;
  className?: string;
}

function isHex(v: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v.trim());
}

const GRADE_STYLES: Record<string, string> = {
  AAA: 'border-success/30 bg-success/10 text-success',
  AA: 'border-success/30 bg-success/10 text-success',
  'AA-large': 'border-warning/30 bg-warning/10 text-warning',
  fail: 'border-destructive/30 bg-destructive/10 text-destructive',
};

const GRADE_LABELS: Record<string, string> = {
  AAA: 'AAA',
  AA: 'AA',
  'AA-large': 'AA·L',
  fail: 'Low',
};

interface ContrastBadgeProps {
  pair: string;
  value: string;
  pairLabel?: string;
}

function ContrastBadge({ pair, value, pairLabel }: Readonly<ContrastBadgeProps>) {
  const ratio = contrastRatio(value, pair);
  if (ratio === null) {
    return null;
  }
  const grade = gradeContrast(ratio);
  const suffix = pairLabel ? ` — ${pairLabel}` : '';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-px font-medium font-mono text-[9px] leading-none',
        GRADE_STYLES[grade]
      )}
      title={`${ratio.toFixed(2)}:1 contrast${suffix}. WCAG ${grade}.`}
    >
      <span>{GRADE_LABELS[grade]}</span>
      <span className="tabular-nums opacity-60">{ratio.toFixed(1)}</span>
    </span>
  );
}

interface TokenLabelTooltipProps {
  cssVar?: string;
  description?: string;
  example?: string;
  children: React.ReactNode;
}

function TokenLabelTooltip({
  cssVar,
  description,
  example,
  children,
}: Readonly<TokenLabelTooltipProps>) {
  if (!description && !cssVar && !example) {
    return <>{children}</>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-65 space-y-1 px-3 py-2 text-left">
        {cssVar && <div className="font-mono text-[10px] opacity-70">{cssVar}</div>}
        {description && <p className="text-[11px] leading-snug">{description}</p>}
        {example && <code className="block font-mono text-[10px] opacity-80">{example}</code>}
      </TooltipContent>
    </Tooltip>
  );
}

export function ColorField({
  label,
  value,
  onChange,
  pairWith,
  pairLabel,
  description,
  example,
  cssVar,
  className,
}: Readonly<ColorFieldProps>) {
  const { t } = useTranslation('themeBuilder');
  const handlePicker = (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value);
  const handleText = (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value);

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border bg-background/40 px-1.5 py-1 transition-colors hover:border-primary/40',
        className
      )}
    >
      <div className="relative size-6 shrink-0 overflow-hidden rounded border shadow-sm">
        <div className="absolute inset-0" style={{ backgroundColor: value }} />
        <input
          id={`color-${label}`}
          type="color"
          value={isHex(value) ? value : '#000000'}
          onChange={handlePicker}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          aria-label={t('fields.color.pickAria', { label })}
        />
      </div>
      <TokenLabelTooltip cssVar={cssVar} description={description} example={example}>
        <label
          className="min-w-0 flex-1 cursor-pointer truncate font-mono text-[11px] text-foreground/90"
          htmlFor={`color-${label}`}
        >
          {label}
        </label>
      </TokenLabelTooltip>
      {pairWith && <ContrastBadge pair={pairWith} value={value} pairLabel={pairLabel} />}
      <input
        type="text"
        value={value}
        onChange={handleText}
        spellCheck={false}
        className="w-20 rounded border border-input-border bg-input-container px-1.5 py-0.5 font-mono text-[10px] text-input-label outline-none transition-[color,box-shadow] placeholder:text-input-placeholder focus-visible:ring-themed"
      />
    </div>
  );
}
